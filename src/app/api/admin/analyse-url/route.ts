import { NextResponse } from 'next/server';
import { analyseContentRelevance } from '@/lib/claude';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { cleanHtmlContent } from '@/lib/utils';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required', success: false },
        { status: 400 }
      );
    }

    // Validate URL is a .gov.au domain to prevent SSRF
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith('.gov.au')) {
        return NextResponse.json(
          { error: 'Only .gov.au URLs are allowed', success: false },
          { status: 400 }
        );
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json(
          { error: 'Only HTTP/HTTPS URLs are allowed', success: false },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format', success: false },
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

    // Fetch the URL content
    let content: string;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)',
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch URL: ${response.statusText}`, success: false },
          { status: 400 }
        );
      }

      content = await response.text();
    } catch (fetchError) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`, success: false },
        { status: 400 }
      );
    }

    // Strip HTML tags and clean content for analysis
    const cleanContent = cleanHtmlContent(content);

    // Analyse the content with Claude
    const analysis = await analyseContentRelevance(cleanContent, url);

    // Extract title from content (basic extraction)
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

    return NextResponse.json({
      data: {
        url,
        title,
        analysis,
        discoveredAt: new Date().toISOString(),
      },
      success: true,
    });
  } catch (error) {
    console.error('Error analysing URL:', error);
    return NextResponse.json(
      { error: 'Failed to analyse URL', success: false },
      { status: 500 }
    );
  }
}
