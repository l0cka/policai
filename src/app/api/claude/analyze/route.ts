import { NextResponse } from 'next/server';
import { analyseContentRelevance } from '@/lib/claude';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const user = await verifyAuth(request);
  if (!user) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { content, sourceUrl } = body;

    if (!content || !sourceUrl) {
      return NextResponse.json(
        { error: 'content and sourceUrl are required', success: false },
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

    const analysis = await analyseContentRelevance(content, sourceUrl);

    return NextResponse.json({
      data: analysis,
      success: true,
    });
  } catch (error) {
    console.error('Error analysing content:', error);
    return NextResponse.json(
      { error: 'Failed to analyse content', success: false },
      { status: 500 }
    );
  }
}
