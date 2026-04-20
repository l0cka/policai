import type { ResearchFinding, VerificationResult, Policy } from '@/types';
import { updateFindingStatus } from './pipeline-storage';
import { extractJsonFromResponse, titleSimilarity, normalizeUrl } from '@/lib/utils';
import {
  getPolicies,
  createPolicy as createPolicyInDb,
  updatePolicy as updatePolicyInDb,
} from '@/lib/data-service';
import { ai, AI_MODEL, getResponseText } from '@/lib/ai-client';

/**
 * Generate a proper policy entry from a verified finding using AI
 */
async function generatePolicyEntry(
  finding: ResearchFinding,
  verification: VerificationResult
): Promise<Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>> {
  const completion = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an implementation agent for an Australian AI Policy Tracker. Generate a complete, accurate policy database entry from this verified research finding.

FINDING:
Title: ${finding.title}
Summary: ${finding.summary}
Source URL: ${finding.sourceUrl}
Type: ${finding.suggestedType}
Jurisdiction: ${finding.suggestedJurisdiction}
Tags: ${finding.tags.join(', ')}
Agencies: ${finding.agencies.join(', ')}
Key Dates: ${finding.keyDates.join(', ')}

VERIFICATION NOTES:
Outcome: ${verification.outcome}
Confidence: ${verification.confidenceScore}
Notes: ${verification.verificationNotes}
${verification.suggestedCorrections.length > 0 ? `Corrections: ${verification.suggestedCorrections.join('; ')}` : ''}

SOURCE CONTENT:
${finding.sourceContent.slice(0, 3000)}

Generate a policy entry. Apply any suggested corrections from verification. Be factual and accurate.

Respond in JSON format:
{
  "title": "official policy title",
  "description": "2-3 sentence accurate description",
  "jurisdiction": "federal|nsw|vic|qld|wa|sa|tas|act|nt",
  "type": "legislation|regulation|guideline|framework|standard|practice_note",
  "status": "proposed|active|amended|repealed",
  "effectiveDate": "YYYY-MM-DD or empty string",
  "agencies": ["agencies involved"],
  "sourceUrl": "source URL",
  "content": "detailed content/notes about the policy",
  "aiSummary": "AI-generated summary with key points",
  "tags": ["relevant tags"]
}`,
      },
    ],
  });

  const text = getResponseText(completion);

  const jsonResult = extractJsonFromResponse<Omit<Policy, 'id' | 'createdAt' | 'updatedAt'> | null>(text, null);
  if (jsonResult) {
    return jsonResult;
  }

  // Fallback: build from finding data directly
  return {
    title: finding.title,
    description: finding.summary,
    jurisdiction: (finding.suggestedJurisdiction as Policy['jurisdiction']) || 'federal',
    type: (finding.suggestedType as Policy['type']) || 'guideline',
    status: 'active',
    effectiveDate: finding.keyDates[0] || '',
    agencies: finding.agencies,
    sourceUrl: finding.sourceUrl,
    content: finding.sourceContent.slice(0, 5000),
    aiSummary: finding.summary,
    tags: finding.tags,
  };
}

/**
 * Generate a slug-based ID from a title
 */
function generatePolicyId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export interface ImplementationResult {
  findingId: string;
  action: 'created' | 'updated' | 'skipped';
  policyId: string;
  error?: string;
}

export interface ImplementationAgentResult {
  results: ImplementationResult[];
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}

/**
 * Run the Implementation Agent - applies verified findings to the policy database
 */
export async function runImplementationAgent(
  findings: ResearchFinding[],
  verifications: VerificationResult[]
): Promise<ImplementationAgentResult> {
  const results: ImplementationResult[] = [];
  const errors: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const policies = await getPolicies(undefined, { access: 'admin' });
  const verificationMap = new Map(verifications.map(v => [v.findingId, v]));

  // Only implement verified findings
  const verifiedFindings = findings.filter(f => f.status === 'verified');

  for (const finding of verifiedFindings) {
    try {
      const verification = verificationMap.get(finding.id);
      if (!verification || verification.confidenceScore < 0.6) {
        results.push({
          findingId: finding.id,
          action: 'skipped',
          policyId: '',
          error: 'Insufficient verification confidence',
        });
        skippedCount++;
        continue;
      }

      console.log(`[Implementation Agent] Processing: ${finding.title}`);

      // Check if this is an update to an existing policy (fuzzy title + URL match)
      const normFindingUrl = finding.sourceUrl ? normalizeUrl(finding.sourceUrl) : '';
      const existingPolicy = policies.find(p => {
        // Exact or fuzzy title match
        if (titleSimilarity(p.title, finding.title) >= 0.6) return true;
        // Normalized URL match
        if (normFindingUrl && p.sourceUrl && normalizeUrl(p.sourceUrl) === normFindingUrl) return true;
        return false;
      });

      if (existingPolicy) {
        // Update existing policy via data-service
        const policyData = await generatePolicyEntry(finding, verification);

        await updatePolicyInDb(existingPolicy.id, {
          description: policyData.description,
          aiSummary: policyData.aiSummary,
          tags: [...new Set([...existingPolicy.tags, ...policyData.tags])],
          agencies: [...new Set([...existingPolicy.agencies, ...policyData.agencies])],
        });

        await updateFindingStatus(finding.id, 'implemented');
        results.push({
          findingId: finding.id,
          action: 'updated',
          policyId: existingPolicy.id,
        });
        updatedCount++;
      } else {
        // Create new policy via data-service
        const policyData = await generatePolicyEntry(finding, verification);
        const policyId = generatePolicyId(policyData.title);

        // Check for duplicate IDs
        if (policies.find(p => p.id === policyId)) {
          results.push({
            findingId: finding.id,
            action: 'skipped',
            policyId,
            error: 'Policy with this ID already exists',
          });
          skippedCount++;
          continue;
        }

        const newPolicy: Policy = {
          ...policyData,
          id: policyId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await createPolicyInDb(newPolicy);
        await updateFindingStatus(finding.id, 'implemented');
        results.push({
          findingId: finding.id,
          action: 'created',
          policyId,
        });
        createdCount++;
      }

      // Rate limit: 1s between AI calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      const errMsg = `Failed to implement "${finding.title}": ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(`[Implementation Agent] ${errMsg}`);
      errors.push(errMsg);
      results.push({
        findingId: finding.id,
        action: 'skipped',
        policyId: '',
        error: errMsg,
      });
      skippedCount++;
    }
  }

  console.log(`[Implementation Agent] Complete. Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);

  return {
    results,
    createdCount,
    updatedCount,
    skippedCount,
    errors,
  };
}
