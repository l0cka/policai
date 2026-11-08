import {
  developmentRenewal,
  developmentsRenewedByPublication,
  linkedDevelopmentId,
  originDevelopmentIds,
  reviewPreviousSourceUrl,
  type PublishedRecordRef,
} from '@/lib/source-review';
import type { Development, Policy, SourceReview, TimelineEvent } from '@/types';

/**
 * The record a signed, published review verified, while the record still
 * carries that review's verification; otherwise null.
 */
export function signedPublishedRecord(
  review: SourceReview,
  record: Policy | TimelineEvent | undefined,
): PublishedRecordRef | null {
  if (review.status !== 'published' || !review.decision?.approval) return null;
  if (review.entryKind !== 'policy' && review.entryKind !== 'timeline_event') return null;
  if (!record || record.id !== (review.proposedRecord as { id?: string } | undefined)?.id) return null;
  if (
    record.verification.checkedAt !== review.reviewedAt ||
    record.verification.source.contentHash !== review.sourceEvidence?.contentHash
  )
    return null;
  return { kind: review.entryKind, id: record.id, sourceUrl: record.sourceUrl, verification: record.verification };
}

/** True when the development's verification is older than the record's. */
export function verifiedBefore(development: Development, record: PublishedRecordRef): boolean {
  const developmentTime = Date.parse(development.verification.checkedAt ?? '');
  return Number.isNaN(developmentTime) || developmentTime < Date.parse(record.verification.checkedAt!);
}

/**
 * The renewals `developmentsRenewedByPublication` would have made when
 * `review` published, for a signed review published before the rule covered
 * its developments. Developments verified since the review are left alone.
 */
export function renewalsForPublishedReview(input: {
  review: SourceReview;
  record: Policy | TimelineEvent | undefined;
  developments: readonly Development[];
  reviews: readonly SourceReview[];
}): { id: string; changes: Pick<Development, 'url' | 'verification'> }[] | null {
  const record = signedPublishedRecord(input.review, input.record);
  if (!record) return null;
  return developmentsRenewedByPublication(
    input.developments,
    record,
    reviewPreviousSourceUrl(input.review),
    linkedDevelopmentId(input.review),
    originDevelopmentIds(input.reviews, record.id),
  )
    .filter((development) => verifiedBefore(development, record))
    .map((development) => ({ id: development.id, changes: developmentRenewal(record) }));
}
