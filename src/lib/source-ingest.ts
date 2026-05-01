import { randomUUID } from 'node:crypto';
import { analyseContentRelevance } from '@/lib/claude';
import { cleanHtmlContent } from '@/lib/utils';
import {
  createPolicy,
  createSourceReview,
  createTimelineEvent,
  getPolicies,
  getSourceReviewById,
  getSourceReviews,
  getTimelineEvents,
  logMcpAuditEvent,
  sourceUrlExists,
  updateSourceReview,
} from '@/lib/data-service';
import type {
  McpAuditLog,
  Policy,
  SourceReview,
  SourceReviewEntryKind,
  SourceReviewStatus,
  TimelineEvent,
} from '@/types';

export interface SourceAnalysisResult {
  url: string;
  title: string;
  cleanContent: string;
  analysis: {
    isRelevant: boolean;
    relevanceScore: number;
    policyType?: string | null;
    jurisdiction?: string | null;
    summary: string;
    tags?: string[];
    agencies?: string[];
  };
  discoveredAt: string;
}

export function validateSourceUrl(url: string, options: { stageOnly?: boolean } = {}) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are allowed');
  }

  const isGovAu = parsed.hostname.endsWith('.gov.au');
  if (!isGovAu && !options.stageOnly) {
    throw new Error('Only .gov.au URLs can be analysed or published directly');
  }

  return { parsed, isGovAu };
}

export async function analyseSourceUrl(url: string, options: { stageOnly?: boolean } = {}): Promise<SourceAnalysisResult> {
  validateSourceUrl(url, options);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Policai/1.0 (Australian AI Policy Tracker)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.statusText}`);
  }

  const html = await response.text();
  const cleanContent = cleanHtmlContent(html);
  const analysis = await analyseContentRelevance(cleanContent, url);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

  return {
    url,
    title,
    cleanContent,
    analysis,
    discoveredAt: new Date().toISOString(),
  };
}

function slugify(value: string, maxLength = 60): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxLength);
}

export function buildProposedRecord(
  entryKind: SourceReviewEntryKind,
  analysisResult: SourceAnalysisResult,
): Policy | TimelineEvent {
  const now = new Date().toISOString();
  const baseId = slugify(analysisResult.title || new URL(analysisResult.url).hostname) || randomUUID();
  const jurisdiction = (analysisResult.analysis.jurisdiction || 'federal') as Policy['jurisdiction'];

  if (entryKind === 'timeline_event') {
    return {
      id: `timeline-${baseId}`,
      date: now.split('T')[0],
      title: analysisResult.title,
      description: analysisResult.analysis.summary,
      type: 'announcement',
      jurisdiction,
      sourceUrl: analysisResult.url,
    };
  }

  return {
    id: baseId,
    title: analysisResult.title,
    description: analysisResult.analysis.summary,
    jurisdiction,
    type: (analysisResult.analysis.policyType || 'guideline') as Policy['type'],
    status: 'active',
    effectiveDate: now.split('T')[0],
    agencies: analysisResult.analysis.agencies || [],
    sourceUrl: analysisResult.url,
    content: analysisResult.cleanContent.slice(0, 4000),
    aiSummary: analysisResult.analysis.summary,
    tags: analysisResult.analysis.tags || [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function stageSourceUrl(input: {
  url: string;
  entryKind: SourceReviewEntryKind;
  notes?: string;
  actor: string;
  stageOnly?: boolean;
}): Promise<SourceReview> {
  validateSourceUrl(input.url, { stageOnly: input.stageOnly });
  if (await sourceUrlExists(input.url)) {
    throw new Error('Source URL already exists in tracked or staged content');
  }

  const analysisResult = await analyseSourceUrl(input.url, { stageOnly: input.stageOnly });
  const proposedRecord = buildProposedRecord(input.entryKind, analysisResult);
  const now = new Date().toISOString();

  return createSourceReview({
    id: `source-review-${randomUUID()}`,
    sourceUrl: input.url,
    title: analysisResult.title,
    entryKind: input.entryKind,
    status: 'pending_review',
    discoveredAt: now,
    createdBy: input.actor,
    notes: input.notes,
    analysis: {
      isRelevant: analysisResult.analysis.isRelevant,
      relevanceScore: analysisResult.analysis.relevanceScore,
      suggestedType: analysisResult.analysis.policyType || null,
      suggestedJurisdiction: analysisResult.analysis.jurisdiction || null,
      summary: analysisResult.analysis.summary,
      tags: analysisResult.analysis.tags,
      agencies: analysisResult.analysis.agencies,
    },
    proposedRecord,
    updatedAt: now,
  });
}

export async function publishStagedSource(id: string): Promise<SourceReview> {
  const review = await getSourceReviewById(id);
  if (!review) {
    throw new Error('Staged source not found');
  }
  if (review.status === 'published') {
    return review;
  }
  if (review.status === 'rejected') {
    throw new Error('Rejected sources cannot be published');
  }
  validateSourceUrl(review.sourceUrl);

  const duplicateExists = await sourceUrlExists(review.sourceUrl, { excludeSourceReviewId: review.id });
  if (duplicateExists) {
    throw new Error('Source URL already exists in tracked content');
  }

  if (review.entryKind === 'timeline_event') {
    await createTimelineEvent(review.proposedRecord as TimelineEvent, {
      excludeSourceReviewId: review.id,
    });
  } else {
    await createPolicy(review.proposedRecord as Policy);
  }

  const updated = await updateSourceReview(review.id, {
    status: 'published',
    publishedAt: new Date().toISOString(),
  });
  if (!updated) {
    throw new Error('Failed to update staged source after publishing');
  }
  return updated;
}

export async function rejectStagedSource(id: string, reason?: string): Promise<SourceReview> {
  const updated = await updateSourceReview(id, {
    status: 'rejected',
    rejectionReason: reason,
  });
  if (!updated) {
    throw new Error('Staged source not found');
  }
  return updated;
}

export async function checkCoverage(input: { query?: string; sourceUrl?: string }) {
  const query = input.query?.toLowerCase().trim();
  const sourceUrl = input.sourceUrl?.trim();
  const [policies, timelineEvents, sourceReviews] = await Promise.all([
    getPolicies(undefined, { access: 'admin' }),
    getTimelineEvents(undefined, { includeGenerated: false }),
    getSourceReviews(),
  ]);

  return {
    policies: policies.filter((policy) =>
      (sourceUrl && policy.sourceUrl === sourceUrl) ||
      (query &&
        [
          policy.title,
          policy.description,
          policy.aiSummary,
          policy.sourceUrl,
          ...policy.tags,
          ...policy.agencies,
        ].some((value) => value.toLowerCase().includes(query))),
    ),
    timelineEvents: timelineEvents.filter((event) =>
      (sourceUrl && event.sourceUrl === sourceUrl) ||
      (query &&
        [event.title, event.description, event.sourceUrl || ''].some((value) =>
          value.toLowerCase().includes(query),
        )),
    ),
    stagedSources: sourceReviews.filter((review) =>
      (sourceUrl && review.sourceUrl === sourceUrl) ||
      (query &&
        [
          review.title,
          review.sourceUrl,
          review.analysis.summary,
          ...(review.analysis.tags || []),
          ...(review.analysis.agencies || []),
        ].some((value) => value.toLowerCase().includes(query))),
    ),
  };
}

export async function auditMcpTool(input: Omit<McpAuditLog, 'id' | 'createdAt'>): Promise<void> {
  await logMcpAuditEvent({
    id: `mcp-audit-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...input,
  });
}

export function normalizeReviewStatus(status?: string): SourceReviewStatus | undefined {
  if (!status) return undefined;
  if (['pending_review', 'approved', 'published', 'rejected'].includes(status)) {
    return status as SourceReviewStatus;
  }
  throw new Error('Invalid source review status');
}
