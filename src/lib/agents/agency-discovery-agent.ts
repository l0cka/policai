import OpenAI from 'openai';
import { ai, AI_MODEL, getResponseText } from '@/lib/ai-client';
import { extractJsonFromResponse } from '@/lib/utils';
import { cleanHtmlContent } from '@/lib/utils';
import type { Jurisdiction } from '@/types';

export interface AgencyUpdate {
  id: string;
  name: string;
  acronym: string;
  level: 'federal' | 'state';
  jurisdiction: Jurisdiction;
  aiTransparencyStatement: string;
  aiUsageDisclosure?: string;
  hasPublishedStatement: boolean;
  transparencyStatementUrl?: string;
  website: string;
  lastUpdated: string;
}

const DISCOVERY_MODEL = 'perplexity/sonar-pro';

const SEARCH_QUERIES = [
  'site:gov.au AI transparency statement',
  'site:gov.au artificial intelligence use disclosure',
  'site:gov.au AI usage statement government agency',
  'Australian government agency AI transparency report',
  'site:gov.au responsible AI statement agency',
];

const MAX_DISCOVERED_URLS = 30;
const GOV_AU_URL_REGEX = /https?:\/\/[^\s"'<>)*\[\]]+\.gov\.au[^\s"'<>)*\[\]]*/g;

/**
 * Search for Australian government agency AI transparency statements
 * using Perplexity via OpenRouter. Returns structured agency data.
 * Gracefully returns empty if OPENROUTER_API_KEY is not set.
 */
export async function runAgencyDiscoveryAgent(
  existingAgencyNames: string[],
): Promise<AgencyUpdate[]> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('[Agency Discovery] OPENROUTER_API_KEY not set, skipping');
    return [];
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const knownNames = new Set(existingAgencyNames.map((n) => n.toLowerCase()));
  const discoveredUrls = new Map<string, string>();

  console.log(`[Agency Discovery] Starting search with ${SEARCH_QUERIES.length} queries`);

  // Phase 1: Discover URLs via Perplexity
  for (const query of SEARCH_QUERIES) {
    try {
      console.log(`[Agency Discovery] Searching: "${query}"`);

      const completion = await client.chat.completions.create({
        model: DISCOVERY_MODEL,
        messages: [
          {
            role: 'user',
            content: `Find Australian government (.gov.au) web pages that contain AI transparency statements, AI usage disclosures, or responsible AI commitments by government agencies: ${query}

List each page with its URL and the agency name. Focus on pages where a specific government agency describes how it uses AI, its AI transparency commitments, or its AI usage policies.`,
          },
        ],
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const rawUrls = responseText.match(GOV_AU_URL_REGEX) || [];
      const citations = (completion as unknown as { citations?: string[] }).citations || [];
      const citationUrls = citations.filter((c: string) => c.includes('.gov.au'));

      const allUrls = [...new Set([...rawUrls, ...citationUrls])];

      for (const url of allUrls) {
        const cleaned = cleanExtractedUrl(url);
        if (cleaned && !discoveredUrls.has(cleaned)) {
          const title = extractTitleForUrl(url, responseText) || url;
          discoveredUrls.set(cleaned, title);
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(
        `[Agency Discovery] Search failed for "${query}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const urlsToProcess = Array.from(discoveredUrls.entries()).slice(0, MAX_DISCOVERED_URLS);
  console.log(`[Agency Discovery] Found ${urlsToProcess.length} URLs to process`);

  // Phase 2: Fetch and analyze each page for agency transparency data
  const agencyUpdates: AgencyUpdate[] = [];

  for (const [url, title] of urlsToProcess) {
    try {
      console.log(`[Agency Discovery] Analyzing: ${title} (${url})`);

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)' },
      });
      if (!response.ok) {
        console.error(`[Agency Discovery] HTTP ${response.status} for ${url}`);
        continue;
      }

      const html = await response.text();
      const content = cleanHtmlContent(html);

      // Use AI to extract agency transparency data
      const completion = await ai.chat.completions.create({
        model: AI_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Analyze this Australian government web page and extract AI transparency statement information for the government agency.

URL: ${url}
Content:
${content.slice(0, 5000)}

Extract the following information. If the page contains an AI transparency statement or AI usage disclosure from a specific government agency, return the details.

Respond in JSON format:
{
  "hasStatement": true/false,
  "agencyName": "full official agency name",
  "acronym": "agency acronym or empty string",
  "jurisdiction": "federal|nsw|vic|qld|wa|sa|tas|act|nt",
  "aiTransparencyStatement": "the AI transparency statement text (verbatim or summarized)",
  "aiUsageDisclosure": "how the agency uses AI (if described)",
  "website": "agency main website URL",
  "transparencyStatementUrl": "${url}"
}

If the page does not contain an AI transparency statement from a specific agency, return: {"hasStatement": false}`,
          },
        ],
      });

      const text = getResponseText(completion);
      const parsed = extractJsonFromResponse<{
        hasStatement: boolean;
        agencyName?: string;
        acronym?: string;
        jurisdiction?: string;
        aiTransparencyStatement?: string;
        aiUsageDisclosure?: string;
        website?: string;
        transparencyStatementUrl?: string;
      }>(text, { hasStatement: false });

      if (parsed.hasStatement && parsed.agencyName) {
        const agencyId = parsed.agencyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 50);

        // Skip if we already have this agency
        if (knownNames.has(parsed.agencyName.toLowerCase())) {
          // Still update transparency fields for known agencies
          agencyUpdates.push({
            id: agencyId,
            name: parsed.agencyName,
            acronym: parsed.acronym || '',
            level: parsed.jurisdiction === 'federal' ? 'federal' : 'state',
            jurisdiction: (parsed.jurisdiction as Jurisdiction) || 'federal',
            aiTransparencyStatement: parsed.aiTransparencyStatement || '',
            aiUsageDisclosure: parsed.aiUsageDisclosure,
            hasPublishedStatement: true,
            transparencyStatementUrl: parsed.transparencyStatementUrl || url,
            website: parsed.website || '',
            lastUpdated: new Date().toISOString().split('T')[0],
          });
        } else {
          agencyUpdates.push({
            id: agencyId,
            name: parsed.agencyName,
            acronym: parsed.acronym || '',
            level: parsed.jurisdiction === 'federal' ? 'federal' : 'state',
            jurisdiction: (parsed.jurisdiction as Jurisdiction) || 'federal',
            aiTransparencyStatement: parsed.aiTransparencyStatement || '',
            aiUsageDisclosure: parsed.aiUsageDisclosure,
            hasPublishedStatement: true,
            transparencyStatementUrl: parsed.transparencyStatementUrl || url,
            website: parsed.website || '',
            lastUpdated: new Date().toISOString().split('T')[0],
          });
        }
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[Agency Discovery] Failed to process ${url}:`, err);
    }
  }

  // Deduplicate by agency name
  const seen = new Map<string, AgencyUpdate>();
  for (const update of agencyUpdates) {
    const key = update.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, update);
    }
  }

  const results = Array.from(seen.values());
  console.log(`[Agency Discovery] Complete. Found ${results.length} agency transparency updates`);

  return results;
}

function cleanExtractedUrl(url: string): string | null {
  let cleaned = url.replace(/[*#`\[\]().,;:!?]+$/, '');
  cleaned = cleaned.replace(/["']+$/, '');
  try {
    new URL(cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

function extractTitleForUrl(url: string, text: string): string | null {
  const markdownMatch = text.match(
    new RegExp(`\\[([^\\]]+)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\\)`),
  );
  if (markdownMatch) return markdownMatch[1].trim();

  const lines = text.split('\n');
  for (const line of lines) {
    if (line.includes(url)) {
      const cleaned = line
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/[[\]()]/g, '')
        .replace(/^[\s\-*•]+/, '')
        .replace(/[:\-–]+$/, '')
        .trim();
      if (cleaned.length > 5 && cleaned.length < 200) return cleaned;
    }
  }

  return null;
}
