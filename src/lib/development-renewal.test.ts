/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { renewalsForPublishedReview } from './development-renewal';
import { timelineRevisionHash } from './policy-revision';
import type { Development, SourceReview, TimelineEvent } from '@/types';

const OLD_URL = 'https://example.gov.au/newsroom';
const NEW_URL = 'https://example.gov.au/releases/26-092mr';

const oldVerification = {
  status: 'verified' as const,
  source: { url: OLD_URL, contentHash: 'c'.repeat(64) },
  checkedAt: '2026-08-12T00:00:00.000Z',
  checkedBy: 'Daniel Alkurdi',
  method: 'manual' as const,
};
const previousEvent: TimelineEvent = {
  id: 'tl-event',
  date: '2026-05-08',
  datePrecision: 'day',
  title: 'Open letter',
  description: 'Regulator writes to licensees.',
  type: 'announcement',
  jurisdiction: 'federal',
  sourceUrl: OLD_URL,
  verification: oldVerification,
};
const publishedEvent: TimelineEvent = {
  ...previousEvent,
  sourceUrl: NEW_URL,
  verification: {
    ...oldVerification,
    source: { url: NEW_URL, contentHash: 'a'.repeat(64) },
    checkedAt: '2026-11-06T22:09:24.217Z',
  },
};
const review = {
  id: 'source-review-move',
  entryKind: 'timeline_event',
  status: 'published',
  sourceUrl: NEW_URL,
  sourceEvidence: publishedEvent.verification.source,
  proposedRecord: publishedEvent,
  reviewedAt: publishedEvent.verification.checkedAt,
  targetTimelineEventId: previousEvent.id,
  targetTimelineRevisionHash: timelineRevisionHash(previousEvent),
  decision: { approval: { subject: 'source-review-batch:x:y' } },
} as unknown as SourceReview;

function development(id: string, overrides: Partial<Development> = {}): Development {
  return {
    id,
    title: 'Open letter',
    url: OLD_URL,
    sourceId: 'newsroom',
    sourceName: 'Newsroom',
    jurisdiction: 'federal',
    detectedAt: '2026-05-08T00:00:00.000Z',
    relevanceScore: 1,
    classification: 'curated',
    assessment: { method: 'editorial', assessedAt: '2026-08-12T00:00:00.000Z', promptVersion: 'editorial-review-v1' },
    verification: oldVerification,
    status: 'promoted',
    relatedTimelineEventId: previousEvent.id,
    ...overrides,
  };
}

const moved = { url: NEW_URL, verification: publishedEvent.verification };

describe('renewing developments from an already-published signed review', () => {
  it('moves a development verified from the replaced revision to the record’s new page', () => {
    const result = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      previousRecord: previousEvent,
      developments: [
        development('dev-mirror'),
        development('dev-other-evidence', {
          verification: { ...oldVerification, source: { url: OLD_URL, contentHash: 'd'.repeat(64) } },
        }),
        development('dev-dismissed', { status: 'dismissed' }),
      ],
      reviews: [review],
    });
    expect(result).toEqual({ problems: [], updates: [{ id: 'dev-mirror', changes: moved }] });
  });

  it('renews a development the record was promoted from without the previous revision', () => {
    const origin = { id: 'source-review-dev-origin', status: 'published', proposedRecord: { id: previousEvent.id } };
    const result = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      developments: [
        development('dev-origin', {
          url: 'https://example.gov.au/retired',
          verification: { ...oldVerification, source: { url: 'https://example.gov.au/retired', contentHash: 'e'.repeat(64) } },
        }),
        development('dev-mirror'),
      ],
      reviews: [review, origin as unknown as SourceReview],
    });
    expect(result.updates).toEqual([{ id: 'dev-origin', changes: moved }]);
  });

  it('refuses a previous revision the review was not staged against', () => {
    const result = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      previousRecord: { ...previousEvent, title: 'Edited later' },
      developments: [development('dev-mirror')],
      reviews: [review],
    });
    expect(result.updates).toEqual([]);
    expect(result.problems).toEqual(['the previous tl-event is not the revision source-review-move was staged against']);
  });

  it('refuses a review without a passkey signature or a record verified since', () => {
    const result = renewalsForPublishedReview({
      review: { ...review, decision: undefined },
      record: { ...publishedEvent, verification: { ...publishedEvent.verification, checkedAt: '2026-12-01T00:00:00.000Z' } },
      developments: [development('dev-mirror')],
      reviews: [review],
    });
    expect(result.problems).toEqual([
      'source-review-move has no passkey signature',
      'tl-event has been re-verified since source-review-move; renew from the later review',
    ]);
  });

  it('skips a development that already carries the published verification', () => {
    const result = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      previousRecord: previousEvent,
      developments: [development('dev-mirror', moved)],
      reviews: [review],
    });
    expect(result).toEqual({ problems: [], updates: [] });
  });
});
