import { NextResponse } from 'next/server';
import { summarizePolicy } from '@/lib/claude';
import { DuplicatePolicyError, getPolicies, createPolicy } from '@/lib/data-service';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Policy } from '@/types';

export async function GET(request: Request) {
  const limited = checkRateLimit(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const jurisdiction = searchParams.get('jurisdiction') || undefined;
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;

  const filteredPolicies = await getPolicies({ jurisdiction, type, status, search });

  return NextResponse.json({
    data: filteredPolicies,
    total: filteredPolicies.length,
    success: true,
  });
}

export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { title, description, jurisdiction, type, status, effectiveDate, sourceUrl, content, aiSummary, tags, agencies, generateSummary } = body;

    if (!title || !jurisdiction || !type || !status) {
      return NextResponse.json(
        { error: 'Title, jurisdiction, type, and status are required', success: false },
        { status: 400 }
      );
    }

    // Generate ID from title
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 50);

    // Generate AI summary if requested and API key is available
    let generatedSummary = aiSummary || '';
    let generatedDescription = description || '';

    if (generateSummary !== false && process.env.OPENROUTER_API_KEY) {
      try {
        const contentToSummarise = content || description || title;
        const summaryResult = await summarizePolicy(title, contentToSummarise);

        if (summaryResult.summary && summaryResult.summary !== 'Unable to generate summary') {
          generatedSummary = summaryResult.summary;

          // If description is empty, use the summary
          if (!description) {
            generatedDescription = summaryResult.summary;
          }
        }
      } catch (summaryError) {
        console.error('Failed to generate AI summary:', summaryError);
      }
    }

    const now = new Date().toISOString();
    const newPolicy: Policy = {
      id,
      title,
      description: generatedDescription,
      jurisdiction,
      type,
      status,
      effectiveDate: effectiveDate || now.split('T')[0],
      agencies: agencies || [],
      sourceUrl: sourceUrl || '',
      content: content || '',
      aiSummary: generatedSummary,
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };

    const created = await createPolicy(newPolicy);

    return NextResponse.json({
      data: created,
      success: true,
    });
  } catch (error) {
    if (error instanceof DuplicatePolicyError) {
      return NextResponse.json(
        { error: 'A policy with this title already exists', success: false },
        { status: 409 }
      );
    }

    console.error('Error adding policy:', error);
    return NextResponse.json(
      { error: 'Failed to add policy', success: false },
      { status: 500 }
    );
  }
}
