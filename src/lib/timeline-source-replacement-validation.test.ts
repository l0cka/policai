/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildTimelineEvent } from '@/test/factories';
import type { SourceReview } from '@/types';
import { validateSourceReviews } from './validate-data';

const oldUrl = 'https://example.gov.au/old';
const newUrl = 'https://example.gov.au/new';
const previous = buildTimelineEvent({ sourceUrl: oldUrl });
const current = buildTimelineEvent({ sourceUrl: newUrl });
function review(overrides: Partial<SourceReview> = {}): SourceReview {
  return {
    id: 'historical', sourceUrl: oldUrl, title: previous.title,
    entryKind: 'timeline_event', targetTimelineEventId: previous.id,
    targetTimelineRevisionHash: 'b'.repeat(64), status: 'published',
    discoveredAt: '2026-07-10T00:00:00.000Z', createdBy: 'reviewer',
    updatedAt: '2026-07-10T01:00:00.000Z', reviewedAt: '2026-07-10T00:00:00.000Z',
    reviewedBy: 'test-reviewer', publishedAt: '2026-07-10T01:00:00.000Z',
    analysis: { isRelevant: true, relevanceScore: 1, suggestedType: null, suggestedJurisdiction: 'federal', summary: 'Verified source replacement.' },
    sourceEvidence: previous.verification!.source, proposedRecord: previous,
    ...overrides,
  };
}
const replacement = (overrides: Partial<SourceReview> = {}) => review({
  id: 'replacement', sourceUrl: newUrl, targetTimelineEventPreviousSourceUrl: oldUrl,
  sourceEvidence: current.verification!.source, proposedRecord: current, ...overrides,
});
const errors = (reviews: SourceReview[], event = current) => validateSourceReviews(reviews, { policies: [], timelineEvents: [event] }).errors;

describe('timeline source replacement validation', () => {
  it('retains historical published reviews only with a published replacement', () => {
    expect(errors([review(), replacement()])).toEqual([]);
    expect(errors([review()])).toContain('historical: sourceUrl does not match the target timeline event source');
    expect(errors([review(), replacement({ status: 'approved' })])).toContain('historical: sourceUrl does not match the target timeline event source');
  });
  it('accepts rejected old-URL history only with a published replacement link', () => {
    const rejected = review({ status: 'rejected', rejectionReason: 'Superseded by newer source update replacement' });
    expect(errors([rejected, replacement()])).toEqual([]);
    expect(errors([rejected])).toContain('historical: sourceUrl does not match the target timeline event source');
    expect(errors([rejected, replacement({ status: 'approved' })])).toContain('historical: sourceUrl does not match the target timeline event source');
  });
  it('accepts staged replacements and approved partial publication', () => {
    expect(errors([replacement({ status: 'pending_review' })], previous)).toEqual([]);
    expect(errors([replacement({ status: 'approved' })])).toEqual([]);
  });
  it.each([
    { targetTimelineEventPreviousSourceUrl: newUrl },
    { targetTimelineEventPreviousSourceUrl: 'https://example.gov.au/unrelated' , status: 'pending_review' as const },
    { proposedRecord: previous },
  ])('rejects invalid replacement binding %j', (override) => {
    expect(errors([replacement(override)])).toContain('replacement: invalid target timeline event source replacement');
  });
  it('requires an explicit timeline target for previous source provenance', () => {
    expect(errors([replacement({ targetTimelineEventId: undefined, targetTimelineRevisionHash: undefined })])).toContain('replacement: targetTimelineEventPreviousSourceUrl requires targetTimelineEventId');
  });
});
