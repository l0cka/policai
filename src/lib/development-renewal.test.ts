/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { renewalsForPublishedReview } from './development-renewal';
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
  targetTimelineEventPreviousSourceUrl: OLD_URL,
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

const moved = { url: NEW_URL, verification: publishedEvent.verification }

describe('renewing developments from an already-published signed review', () => {
  it('moves a development on the page the review moved its record from', () => {
    const updates = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      developments: [
        development('dev-old-page'),
        development('dev-other-page', {
          url: 'https://example.gov.au/other',
          verification: { ...oldVerification, source: { url: 'https://example.gov.au/other', contentHash: 'd'.repeat(64) } },
        }),
        development('dev-dismissed', { status: 'dismissed' }),
        development('dev-unrelated', { relatedTimelineEventId: 'tl-other' }),
      ],
      reviews: [review],
    })
    expect(updates).toEqual([{ id: 'dev-old-page', changes: moved }])
  })

  it('renews the development the record was promoted from, whatever page it is on', () => {
    const origin = { id: 'source-review-dev-origin', status: 'published', proposedRecord: { id: previousEvent.id } }
    const retired = 'https://example.gov.au/retired'
    const updates = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      developments: [
        development('dev-origin', {
          url: retired,
          verification: { ...oldVerification, source: { url: retired, contentHash: 'e'.repeat(64) } },
        }),
      ],
      reviews: [review, origin as unknown as SourceReview],
    })
    expect(updates).toEqual([{ id: 'dev-origin', changes: moved }])
  })

  it('refuses a review without a passkey signature, or whose record was verified again since', () => {
    const args = { record: publishedEvent, developments: [development('dev-old-page')], reviews: [review] }
    expect(renewalsForPublishedReview({ ...args, review: { ...review, decision: undefined } })).toBeNull()
    expect(
      renewalsForPublishedReview({
        ...args,
        review,
        record: { ...publishedEvent, verification: { ...publishedEvent.verification, checkedAt: '2026-12-01T00:00:00.000Z' } },
      }),
    ).toBeNull()
  })

  it('skips a development that already carries the published verification or a later one', () => {
    const later = { ...oldVerification, checkedAt: '2026-11-07T00:00:00.000Z' }
    const updates = renewalsForPublishedReview({
      review,
      record: publishedEvent,
      developments: [development('dev-old-page', moved), development('dev-renewed-since', { verification: later })],
      reviews: [review],
    })
    expect(updates).toEqual([])
  })
})
