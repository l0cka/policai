import { NextResponse } from 'next/server';
import { analyseContentRelevance, type ContentAnalysis } from '@/lib/claude';
import { summarizePolicy } from '@/lib/claude';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import * as cheerio from 'cheerio';
import { cleanHtmlContent } from '@/lib/utils';
import { DATA_SOURCES_MAP } from '@/lib/data-sources';
import {
  createPolicy as createPolicyInDb,
  DuplicatePolicyError,
} from '@/lib/data-service';
import type { Policy } from '@/types';

interface ScrapedLink {
  url: string;
  title: string;
  text: string;
}

/**
 * Scrape links from a page that might contain AI policy content
 */
async function scrapeLinks(sourceUrl: string): Promise<ScrapedLink[]> {
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${sourceUrl}: ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const links: ScrapedLink[] = [];

    // Find all links on the page
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();

      if (!href || !text) return;

      // Convert relative URLs to absolute
      let absoluteUrl = href;
      if (href.startsWith('/')) {
        const baseUrl = new URL(sourceUrl);
        absoluteUrl = `${baseUrl.origin}${href}`;
      } else if (!href.startsWith('http')) {
        return; // Skip invalid URLs
      }

      // Filter for likely policy/document links
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

    return links.slice(0, 10); // Limit to 10 links per source
  } catch (error) {
    console.error(`Error scraping ${sourceUrl}:`, error);
    return [];
  }
}

/**
 * Fetch and clean content from a URL
 */
async function fetchContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    return cleanHtmlContent(content);
  } catch (error) {
    throw new Error(`Failed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a policy from analyzed content (direct data-service call, no HTTP loopback)
 */
async function createPolicy(title: string, url: string, analysis: ContentAnalysis, content: string) {
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);

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

  try {
    return await createPolicyInDb(newPolicy);
  } catch (err) {
    if (err instanceof DuplicatePolicyError) {
      console.log(`[scraper] Policy already exists: ${id}`);
      return null;
    }
    throw err;
  }
}

/**
 * Add content to pending review queue (writes directly to JSON file)
 */
async function addToPendingReview(title: string, url: string, analysis: ContentAnalysis) {
  const { readJsonFile, writeJsonFile } = await import('@/lib/file-store');
  const path = await import('path');
  const pendingFile = path.join(process.cwd(), 'public', 'data', 'pending-content.json');

  const pending = await readJsonFile<Array<{ url: string; title: string; analysis: ContentAnalysis }>>(pendingFile, []);
  if (pending.some((p) => p.url === url)) return; // already exists
  pending.push({ url, title, analysis });
  await writeJsonFile(pendingFile, pending);
}

export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { sourceId } = body;

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId is required', success: false },
        { status: 400 }
      );
    }

    // Check if API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured', success: false },
        { status: 500 }
      );
    }

    const source = DATA_SOURCES_MAP[sourceId];
    if (!source) {
      return NextResponse.json(
        { error: 'Invalid sourceId', success: false },
        { status: 400 }
      );
    }

    console.log(`Starting scraper for ${source.name} (${source.url})`);

    // Scrape links from the source page
    const links = await scrapeLinks(source.url);
    console.log(`Found ${links.length} potential policy links`);

    let itemsProcessed = 0;
    let itemsCreated = 0;
    let itemsPending = 0;
    let itemsSkipped = 0;

    // Process each link
    for (const link of links) {
      try {
        console.log(`Processing: ${link.title} (${link.url})`);

        // Fetch content
        const content = await fetchContent(link.url);

        // Analyze with Claude
        const analysis = await analyseContentRelevance(content, link.url);

        itemsProcessed++;

        // Decision logic based on relevance score
        if (analysis.relevanceScore >= 0.8 && analysis.isRelevant) {
          // High confidence - auto-create policy
          try {
            await createPolicy(link.title, link.url, analysis, content);
            itemsCreated++;
            console.log(`✓ Auto-created policy: ${link.title} (score: ${analysis.relevanceScore})`);
          } catch (error) {
            console.error(`Failed to create policy for ${link.title}:`, error);
            // If creation fails, add to pending instead
            await addToPendingReview(link.title, link.url, analysis);
            itemsPending++;
          }
        } else if (analysis.relevanceScore >= 0.5 && analysis.isRelevant) {
          // Medium confidence - add to pending review
          await addToPendingReview(link.title, link.url, analysis);
          itemsPending++;
          console.log(`→ Added to pending: ${link.title} (score: ${analysis.relevanceScore})`);
        } else {
          // Low confidence - skip
          itemsSkipped++;
          console.log(`✗ Skipped: ${link.title} (score: ${analysis.relevanceScore})`);
        }

        // Rate limiting - wait 2 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing ${link.url}:`, error);
        itemsSkipped++;
      }
    }

    console.log(`Scraper completed for ${source.name}`);
    console.log(`Processed: ${itemsProcessed}, Created: ${itemsCreated}, Pending: ${itemsPending}, Skipped: ${itemsSkipped}`);

    return NextResponse.json({
      data: {
        sourceId,
        sourceName: source.name,
        itemsFound: links.length,
        itemsProcessed,
        itemsCreated,
        itemsPending,
        itemsSkipped,
      },
      success: true,
    });
  } catch (error) {
    console.error('Error running scraper:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to run scraper',
        success: false,
      },
      { status: 500 }
    );
  }
}
