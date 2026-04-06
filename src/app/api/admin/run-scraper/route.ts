import { NextResponse } from 'next/server';
import { analyseContentRelevance, type ContentAnalysis } from '@/lib/claude';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import * as cheerio from 'cheerio';
import { cleanHtmlContent } from '@/lib/utils';
import { DATA_SOURCES_MAP } from '@/lib/data-sources';

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
 * Create a policy from analyzed content
 */
async function createPolicy(title: string, url: string, analysis: ContentAnalysis, content: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/policies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      description: analysis.summary,
      jurisdiction: analysis.jurisdiction || 'federal',
      type: analysis.policyType || 'guideline',
      status: 'active',
      sourceUrl: url,
      content: content.slice(0, 10000), // Limit content size
      tags: analysis.tags || [],
      agencies: analysis.agencies || [],
      generateSummary: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create policy');
  }

  return response.json();
}

/**
 * Add content to pending review queue
 */
async function addToPendingReview(title: string, url: string, analysis: ContentAnalysis) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/admin/pending`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      title,
      analysis,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    // If it already exists, that's fine
    if (!error.error?.includes('already exists')) {
      throw new Error(error.error || 'Failed to add to pending review');
    }
  }

  return response.json();
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
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured', success: false },
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
