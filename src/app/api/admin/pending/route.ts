import { NextResponse } from 'next/server';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import {
  createSourceReview,
  deleteSourceReview,
  getSourceReviews,
  updateSourceReview,
} from '@/lib/data-service';
import type { Policy, SourceReview, SourceReviewStatus, TimelineEvent } from '@/types';

function toPendingItem(review: SourceReview) {
  return {
    id: review.id,
    title: review.title,
    source: review.sourceUrl,
    discoveredAt: review.discoveredAt,
    status: review.status,
    aiAnalysis: {
      isRelevant: review.analysis.isRelevant,
      relevanceScore: review.analysis.relevanceScore,
      suggestedType: review.analysis.suggestedType,
      suggestedJurisdiction: review.analysis.suggestedJurisdiction,
      summary: review.analysis.summary,
      tags: review.analysis.tags,
      agencies: review.analysis.agencies,
    },
    entryKind: review.entryKind,
    notes: review.notes,
  };
}

function buildPolicyId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

// GET - Retrieve all pending content
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as SourceReviewStatus | null;

    const reviews = await getSourceReviews(status ? { status } : undefined);
    const items = reviews.map(toPendingItem);

    return NextResponse.json({
      data: items,
      total: items.length,
      success: true,
    });
  } catch (error) {
    console.error('Error reading pending content:', error);
    return NextResponse.json(
      { error: 'Failed to read pending content', success: false },
      { status: 500 },
    );
  }
}

// POST - Add new pending content
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { url, title, analysis, entryKind = 'policy', notes } = body;

    if (!url || !analysis) {
      return NextResponse.json(
        { error: 'URL and analysis are required', success: false },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const reviewTitle = title || 'Untitled';
    const policyId = buildPolicyId(reviewTitle);
    const proposedRecord: Policy | TimelineEvent = entryKind === 'timeline_event'
      ? {
          id: `timeline-${policyId || Date.now()}`,
          date: now.split('T')[0],
          title: reviewTitle,
          description: analysis.summary || '',
          type: 'announcement' as const,
          jurisdiction: analysis.jurisdiction || analysis.suggestedJurisdiction || 'federal',
          sourceUrl: url,
        } as TimelineEvent
      : {
          id: policyId,
          title: reviewTitle,
          description: analysis.summary || '',
          jurisdiction: analysis.jurisdiction || analysis.suggestedJurisdiction || 'federal',
          type: analysis.policyType || analysis.suggestedType || 'guideline',
          status: 'active',
          effectiveDate: now.split('T')[0],
          agencies: analysis.agencies || [],
          sourceUrl: url,
          content: analysis.summary || '',
          aiSummary: analysis.summary || '',
          tags: analysis.tags || [],
          createdAt: now,
          updatedAt: now,
        } as Policy;

    const review = await createSourceReview({
      id: `source-review-${Date.now()}`,
      sourceUrl: url,
      title: reviewTitle,
      entryKind,
      status: 'pending_review',
      discoveredAt: now,
      createdBy: typeof user.email === 'string' ? user.email : user.id || 'admin',
      notes,
      analysis: {
        isRelevant: analysis.isRelevant,
        relevanceScore: analysis.relevanceScore,
        suggestedType: analysis.policyType || analysis.suggestedType || null,
        suggestedJurisdiction: analysis.jurisdiction || analysis.suggestedJurisdiction || null,
        summary: analysis.summary,
        tags: analysis.tags,
        agencies: analysis.agencies,
      },
      proposedRecord,
      updatedAt: now,
    });

    return NextResponse.json({
      data: toPendingItem(review),
      success: true,
    });
  } catch (error) {
    console.error('Error adding pending content:', error);
    return NextResponse.json(
      {
        error: error instanceof Error && error.name === 'DuplicatePolicyError'
          ? 'URL already exists in tracked or pending content'
          : 'Failed to add pending content',
        success: false,
      },
      { status: error instanceof Error && error.name === 'DuplicatePolicyError' ? 400 : 500 },
    );
  }
}

// PUT - Update pending content status (approve/reject)
export async function PUT(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'ID and status are required', success: false },
        { status: 400 },
      );
    }

    if (!['pending_review', 'approved', 'published', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status', success: false },
        { status: 400 },
      );
    }

    const updated = await updateSourceReview(id, { status });
    if (!updated) {
      return NextResponse.json(
        { error: 'Pending content not found', success: false },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: toPendingItem(updated),
      success: true,
    });
  } catch (error) {
    console.error('Error updating pending content:', error);
    return NextResponse.json(
      { error: 'Failed to update pending content', success: false },
      { status: 500 },
    );
  }
}

// DELETE - Remove pending content
export async function DELETE(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required', success: false },
        { status: 400 },
      );
    }

    const deleted = await deleteSourceReview(id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Pending content not found', success: false },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting pending content:', error);
    return NextResponse.json(
      { error: 'Failed to delete pending content', success: false },
      { status: 500 },
    );
  }
}
