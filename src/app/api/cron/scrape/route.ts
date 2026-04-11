/**
 * Vercel Cron endpoint — scrapes all enabled government sources.
 *
 * Triggered by Vercel Cron Jobs on schedule (see vercel.json).
 * Protected by CRON_SECRET so only Vercel infrastructure can invoke it.
 *
 * Fan-out strategy:
 * - Without ?source= param: dispatches one request per enabled source
 *   using waitUntil() so the fan-out doesn't block the response.
 * - With ?source=<sourceId>: scrapes only that single source, keeping
 *   each invocation well under the 300s timeout.
 */

import { NextResponse } from 'next/server';
import { after } from 'next/server';
import * as cheerio from 'cheerio';
import { analyseContentRelevance, summarizePolicy } from '@/lib/claude';
import { cleanHtmlContent } from '@/lib/utils';
import { DATA_SOURCES, type DataSource } from '@/lib/data-sources';
import { createPolicy, policyExists, logScraperRun } from '@/lib/data-service';
import type { Policy } from '@/types';

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ScrapedLink {
  url: string;
  title: string;
  text: string;
}

async function scrapeLinks(sourceUrl: string): Promise<ScrapedLink[]> {
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)' },
    });
    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const links: ScrapedLink[] = [];

    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();
      if (!href || !text) return;

      let absoluteUrl = href;
      if (href.startsWith('/')) {
        const baseUrl = new URL(sourceUrl);
        absoluteUrl = `${baseUrl.origin}${href}`;
      } else if (!href.startsWith('http')) {
        return;
      }

      const isLikelyPolicy =
        href.includes('pdf') ||
        href.includes('policy') ||
        href.includes('guidance') ||
        href.includes('framework') ||
        href.includes('strategy') ||
        href.includes('standard') ||
        href.includes('regulation') ||
        text.toLowerCase().includes('policy') ||
        text.toLowerCase().includes('framework') ||
        text.toLowerCase().includes('guidance') ||
        text.toLowerCase().includes('standard');

      if (isLikelyPolicy) {
        links.push({
          url: absoluteUrl,
          title: text,
          text: $(element).parent().text().trim().slice(0, 500),
        });
      }
    });

    return links.slice(0, 10);
  } catch (error) {
    console.error(`[cron] Error scraping ${sourceUrl}:`, error);
    return [];
  }
}

async function fetchContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return cleanHtmlContent(await response.text());
}

/** Build and persist a new policy from analysed content via data-service. */
async function processHighConfidenceLink(
  title: string,
  url: string,
  analysis: {
    summary?: string;
    jurisdiction?: string;
    policyType?: string;
    tags?: string[];
    agencies?: string[];
  },
  content: string,
): Promise<boolean> {
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);

  if (await policyExists(id)) {
    console.log(`[cron] Policy already exists: ${id}`);
    return false;
  }

  let aiSummary = analysis.summary || '';
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const summaryResult = await summarizePolicy(title, content);
      if (summaryResult.summary && summaryResult.summary !== 'Unable to generate summary') {
        aiSummary = summaryResult.summary;
      }
    } catch {
      // Use the analysis summary as fallback
    }
  }

  const now = new Date().toISOString();
  const newPolicy: Policy = {
    id,
    title,
    description: analysis.summary || '',
    jurisdiction: (analysis.jurisdiction as Policy['jurisdiction']) || 'federal',
    type: (analysis.policyType as Policy['type']) || 'guideline',
    status: 'active',
    effectiveDate: now.split('T')[0],
    agencies: analysis.agencies || [],
    sourceUrl: url,
    content: content.slice(0, 10000),
    aiSummary,
    tags: analysis.tags || [],
    createdAt: now,
    updatedAt: now,
  };

  await createPolicy(newPolicy);
  return true;
}

// ---------------------------------------------------------------------------
// Scrape a single source
// ---------------------------------------------------------------------------

async function scrapeSource(source: DataSource) {
  const startTime = Date.now();
  console.log(`[cron] Scraping: ${source.name} (${source.url})`);

  const links = await scrapeLinks(source.url);
  console.log(`[cron]   Found ${links.length} potential policy links`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const link of links) {
    try {
      const content = await fetchContent(link.url);
      const analysis = await analyseContentRelevance(content, link.url);

      if (analysis.relevanceScore >= 0.8 && analysis.isRelevant) {
        const wasCreated = await processHighConfidenceLink(
          link.title,
          link.url,
          analysis,
          content,
        );
        if (wasCreated) created++;
        else skipped++;
      } else {
        skipped++;
      }

      // Rate limit between pages
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[cron] Error processing ${link.url}:`, msg);
      errors.push(`${link.url}: ${msg}`);
      skipped++;
    }
  }

  const durationMs = Date.now() - startTime;

  // Log the run for monitoring
  await logScraperRun({
    id: `cron-${source.id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sourceId: source.id,
    sourceName: source.name,
    linksFound: links.length,
    policiesCreated: created,
    errors,
    durationMs,
  });

  return { source: source.name, linksFound: links.length, created, skipped, errors };
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function verifyCronAuth(request: Request): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'CRON_SECRET not configured', success: false },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY not configured', success: false },
      { status: 500 },
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const sourceId = url.searchParams.get('source');

  // Single source mode — scrape just one source
  if (sourceId) {
    const source = DATA_SOURCES.find((s) => s.id === sourceId && s.enabled);
    if (!source) {
      return NextResponse.json(
        { error: `Source not found or disabled: ${sourceId}`, success: false },
        { status: 404 },
      );
    }

    const result = await scrapeSource(source);
    const allFailed = result.linksFound > 0 && result.created === 0 && result.errors.length === result.linksFound;
    if (allFailed) {
      return NextResponse.json(
        { success: false, result, error: 'All links failed to process' },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, result });
  }

  // Fan-out mode — dispatch one request per enabled source
  console.log(`[cron] Starting fan-out scrape at ${new Date().toISOString()}`);
  const enabledSources = DATA_SOURCES.filter((s) => s.enabled);

  const cronSecret = process.env.CRON_SECRET!;

  after(async () => {
    for (const source of enabledSources) {
      try {
        const sourceUrl = new URL(url.pathname, url.origin);
        sourceUrl.searchParams.set('source', source.id);

        await fetch(sourceUrl.toString(), {
          headers: { Authorization: `Bearer ${cronSecret}` },
        });
      } catch (err) {
        console.error(`[cron] Failed to dispatch ${source.name}:`, err);
      }

      // Stagger dispatches by 2s to avoid thundering herd
      await new Promise((r) => setTimeout(r, 2000));
    }
  });

  return NextResponse.json({
    success: true,
    dispatched: true,
    sources: enabledSources.map((s) => s.id),
    timestamp: new Date().toISOString(),
  });
}
