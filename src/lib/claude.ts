import type { Policy, NewsItem } from '@/types';
import { extractJsonFromResponse } from '@/lib/utils';
import { ai, AI_MODEL, getResponseText } from '@/lib/ai-client';

export interface ContentAnalysis {
  isRelevant: boolean;
  relevanceScore: number;
  summary: string;
  tags: string[];
  policyType?: string;
  jurisdiction?: string;
  agencies: string[];
  keyDates: string[];
  relatedTopics: string[];
}

export interface PolicySummary {
  summary: string;
  keyPoints: string[];
  implications: string[];
  affectedSectors: string[];
}

// Analyse web content for AI policy relevance
export async function analyseContentRelevance(
  content: string,
  sourceUrl: string
): Promise<ContentAnalysis> {
  const completion = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyse the following web content and determine if it's relevant to Australian AI policy, regulation, or governance.

Only mark content as relevant when the page itself materially discusses AI or automated decision-making policy, regulation, standards, frameworks, guidance, assurance, safety, ethics, procurement, or government adoption.

Do NOT mark content as relevant if it is primarily:
- generic site navigation or landing-page content
- privacy policies, accessibility statements, cookie notices, terms, or copyright pages
- generic "mission", "commitments", or organisational strategy pages unless they explicitly govern AI
- a general policy hub that is not specifically about AI policy/governance

Source URL: ${sourceUrl}

Content:
${content.slice(0, 4000)}

Please respond in JSON format with the following structure:
{
  "isRelevant": boolean,
  "relevanceScore": number between 0 and 1,
  "summary": "brief summary if relevant",
  "tags": ["relevant", "tags"],
  "policyType": "legislation|regulation|guideline|framework|standard|practice_note|null",
  "jurisdiction": "federal|nsw|vic|qld|wa|sa|tas|act|nt|null",
  "agencies": ["mentioned agencies"],
  "keyDates": ["any important dates mentioned"],
  "relatedTopics": ["AI ethics", "data privacy", etc]
}`,
      },
    ],
  });

  const responseText = getResponseText(completion);

  return extractJsonFromResponse<ContentAnalysis>(responseText, {
    isRelevant: false,
    relevanceScore: 0,
    summary: '',
    tags: [],
    agencies: [],
    keyDates: [],
    relatedTopics: [],
  });
}

// Generate a detailed summary of a policy document
export async function summarizePolicy(
  title: string,
  content: string
): Promise<PolicySummary> {
  const completion = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Summarize the following Australian AI policy document:

Title: ${title}

Content:
${content.slice(0, 6000)}

Please respond in JSON format:
{
  "summary": "2-3 sentence summary",
  "keyPoints": ["key point 1", "key point 2", ...],
  "implications": ["implication for AI use", ...],
  "affectedSectors": ["healthcare", "finance", etc]
}`,
      },
    ],
  });

  const responseText = getResponseText(completion);

  return extractJsonFromResponse<PolicySummary>(responseText, {
    summary: 'Unable to generate summary',
    keyPoints: [],
    implications: [],
    affectedSectors: [],
  });
}

// Extract entities and relationships from policy text
export async function extractPolicyEntities(content: string) {
  const completion = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Extract entities and relationships from this Australian AI policy text:

${content.slice(0, 4000)}

Respond in JSON format:
{
  "agencies": [{"name": "...", "role": "regulator|advisor|implementer"}],
  "relatedPolicies": ["policy names mentioned"],
  "technologies": ["AI", "ML", "specific tech mentioned"],
  "sectors": ["affected sectors"],
  "requirements": ["key requirements or obligations"],
  "penalties": ["any penalties or enforcement mentioned"]
}`,
      },
    ],
  });

  const responseText = getResponseText(completion);

  return extractJsonFromResponse(responseText, {
    agencies: [],
    relatedPolicies: [],
    technologies: [],
    sectors: [],
    requirements: [],
    penalties: [],
  });
}

// Categorize a news item
export async function categorizeNewsItem(
  title: string,
  content: string
): Promise<Partial<NewsItem>> {
  const completion = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Categorize this AI policy news item:

Title: ${title}
Content: ${content.slice(0, 2000)}

Respond in JSON:
{
  "summary": "1-2 sentence summary",
  "relevanceScore": 0.0-1.0,
  "tags": ["relevant tags"]
}`,
      },
    ],
  });

  const responseText = getResponseText(completion);

  return extractJsonFromResponse<Partial<NewsItem>>(responseText, {
    summary: title,
    relevanceScore: 0.5,
    tags: [],
  });
}

// Find relationships between policies
export async function findPolicyRelationships(
  policy1: Pick<Policy, 'title' | 'description'>,
  policy2: Pick<Policy, 'title' | 'description'>
) {
  const completion = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Analyse the relationship between these two Australian AI policies:

Policy 1:
Title: ${policy1.title}
Description: ${policy1.description}

Policy 2:
Title: ${policy2.title}
Description: ${policy2.description}

Respond in JSON:
{
  "hasRelationship": boolean,
  "relationshipType": "supersedes|amends|related_to|implements|null",
  "explanation": "brief explanation",
  "strength": 0.0-1.0
}`,
      },
    ],
  });

  const responseText = getResponseText(completion);

  return extractJsonFromResponse(responseText, {
    hasRelationship: false,
    relationshipType: null,
    explanation: '',
    strength: 0,
  });
}
