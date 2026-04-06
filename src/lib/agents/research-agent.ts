import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import type { ResearchFinding, PolicyType, Jurisdiction } from '@/types';
import { saveFindings } from './pipeline-storage';
import { cleanHtmlContent, extractJsonFromResponse } from '@/lib/utils';
import { DATA_SOURCES } from '@/lib/data-sources';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const MODEL = 'claude-sonnet-4-20250514';

const RESEARCH_SOURCES = DATA_SOURCES.filter((s) => s.enabled);

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  sourceId: string;
}

/**
 * Scrape links from a source page
 */
async function scrapeSourceLinks(sourceUrl: string): Promise<{ url: string; title: string }[]> {
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)' },
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const links: { url: string; title: string }[] = [];

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;

      let absoluteUrl = href;
      if (href.startsWith('/')) {
        const base = new URL(sourceUrl);
        absoluteUrl = `${base.origin}${href}`;
      } else if (!href.startsWith('http')) {
        return;
      }

      const keywords = ['policy', 'framework', 'guidance', 'standard', 'regulation', 'strategy', 'ai', 'artificial-intelligence', 'digital'];
      const combined = (href + ' ' + text).toLowerCase();
      if (keywords.some(kw => combined.includes(kw))) {
        links.push({ url: absoluteUrl, title: text });
      }
    });

    return links.slice(0, 15);
  } catch {
    return [];
  }
}

/**
 * Fetch and clean page content
 */
async function fetchPageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return cleanHtmlContent(html);
}

/**
 * Use Claude to analyze a page for AI policy research findings
 */
async function analyzeForFindings(
  page: ScrapedPage,
  existingPolicyTitles: string[]
): Promise<Omit<ResearchFinding, 'id' | 'pipelineRunId' | 'status'>[]> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are a research agent for an Australian AI Policy Tracker. Analyse this web page content and extract any AI policy findings.

Source: ${page.url}
Page Title: ${page.title}

Content:
${page.content.slice(0, 6000)}

Existing policies already tracked:
${existingPolicyTitles.slice(0, 20).map(t => `- ${t}`).join('\n')}

For each distinct AI policy finding on this page, extract the details. A finding could be:
- A new policy, framework, guideline, or regulation
- An update or amendment to an existing tracked policy
- A significant government announcement about AI governance

Respond in JSON format:
{
  "findings": [
    {
      "title": "name of the policy/finding",
      "summary": "2-3 sentence summary of what this finding is about",
      "relevanceScore": 0.0-1.0,
      "suggestedType": "legislation|regulation|guideline|framework|standard|null",
      "suggestedJurisdiction": "federal|nsw|vic|qld|wa|sa|tas|act|nt|null",
      "tags": ["relevant tags"],
      "agencies": ["government agencies mentioned"],
      "keyDates": ["important dates YYYY-MM-DD"],
      "relatedTopics": ["related topics"],
      "isNewPolicy": true/false,
      "existingPolicyTitle": "title of existing policy if this is an update, or null",
      "changeDescription": "what changed if this is an update to existing policy, or null"
    }
  ]
}

If the page has no relevant AI policy content, return: {"findings": []}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  const parsed = extractJsonFromResponse<{ findings?: Record<string, unknown>[] }>(text, { findings: [] });
  return (parsed.findings || []).map((f) => ({
    title: f.title as string,
    summary: f.summary as string,
    sourceUrl: page.url,
    sourceContent: page.content.slice(0, 2000),
    discoveredAt: new Date().toISOString(),
    relevanceScore: f.relevanceScore as number,
    suggestedType: (f.suggestedType as PolicyType) || null,
    suggestedJurisdiction: (f.suggestedJurisdiction as Jurisdiction) || null,
    tags: (f.tags as string[]) || [],
    agencies: (f.agencies as string[]) || [],
    keyDates: (f.keyDates as string[]) || [],
    relatedTopics: (f.relatedTopics as string[]) || [],
    isNewPolicy: f.isNewPolicy as boolean,
    existingPolicyId: undefined,
    changeDescription: f.changeDescription as string | undefined,
  }));
}

export interface ResearchAgentResult {
  findings: ResearchFinding[];
  sourcesScanned: string[];
  errors: string[];
}

/**
 * Run the Research Agent - scans all sources for new AI policy information
 */
export async function runResearchAgent(
  pipelineRunId: string,
  existingPolicyTitles: string[]
): Promise<ResearchAgentResult> {
  const allFindings: ResearchFinding[] = [];
  const sourcesScanned: string[] = [];
  const errors: string[] = [];
  let findingCounter = 0;

  for (const source of RESEARCH_SOURCES) {
    try {
      console.log(`[Research Agent] Scanning: ${source.name} (${source.url})`);
      sourcesScanned.push(source.id);

      // Get links from source page
      const links = await scrapeSourceLinks(source.url);
      console.log(`[Research Agent] Found ${links.length} links from ${source.name}`);

      // Also analyze the source page itself
      const pages: ScrapedPage[] = [];

      try {
        const sourceContent = await fetchPageContent(source.url);
        pages.push({
          url: source.url,
          title: source.name,
          content: sourceContent,
          sourceId: source.id,
        });
      } catch (err) {
        console.error(`[Research Agent] Failed to fetch source page: ${source.url}`, err);
      }

      // Fetch content from linked pages (limit to 5 per source)
      for (const link of links.slice(0, 5)) {
        try {
          const content = await fetchPageContent(link.url);
          pages.push({
            url: link.url,
            title: link.title,
            content,
            sourceId: source.id,
          });

          // Rate limit: 2s between fetches
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (err) {
          console.error(`[Research Agent] Failed to fetch: ${link.url}`, err);
        }
      }

      // Analyze each page for findings
      for (const page of pages) {
        try {
          const pageFindings = await analyzeForFindings(page, existingPolicyTitles);

          for (const finding of pageFindings) {
            if (finding.relevanceScore >= 0.5) {
              findingCounter++;
              allFindings.push({
                ...finding,
                id: `finding-${pipelineRunId}-${findingCounter}`,
                pipelineRunId,
                status: 'discovered',
              } as ResearchFinding);
            }
          }

          // Rate limit: 1s between AI calls
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          console.error(`[Research Agent] Analysis failed for: ${page.url}`, err);
        }
      }

      // Rate limit: 3s between sources
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      const errMsg = `Failed to scan ${source.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(`[Research Agent] ${errMsg}`);
      errors.push(errMsg);
    }
  }

  // Deduplicate findings by title similarity
  const uniqueFindings = deduplicateFindings(allFindings);

  // Save findings to storage
  await saveFindings(uniqueFindings);

  console.log(`[Research Agent] Complete. Found ${uniqueFindings.length} unique findings from ${sourcesScanned.length} sources.`);

  return {
    findings: uniqueFindings,
    sourcesScanned,
    errors,
  };
}

/**
 * Remove duplicate findings based on title similarity
 */
function deduplicateFindings(findings: ResearchFinding[]): ResearchFinding[] {
  const seen = new Map<string, ResearchFinding>();

  for (const finding of findings) {
    const normalizedTitle = finding.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = seen.get(normalizedTitle);

    if (!existing || finding.relevanceScore > existing.relevanceScore) {
      seen.set(normalizedTitle, finding);
    }
  }

  return Array.from(seen.values());
}
