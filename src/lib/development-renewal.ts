import { policyRevisionHash, timelineRevisionHash } from '@/lib/policy-revision';
import {
  developmentRenewal,
  developmentsRenewedByPublication,
  linkedDevelopmentId,
  originDevelopmentIds,
  type PublishedRecordRef,
} from '@/lib/source-review';
import type { Development, Policy, SourceReview, TimelineEvent } from '@/types';

/**
 * Applies the publication renewal rule (`developmentsRenewedByPublication`)
 * after the fact, for a signed review published before the rule covered its
 * developments. The record must still carry that review's verification.
 *
 * `previousRecord` is the record as it stood just before publication (from
 * git). It is used only when its revision hash is the one the review was
 * staged against, so it is exactly the version the signed review replaced.
 */
export function renewalsForPublishedReview(input: {
  review: SourceReview;
  record: Policy | TimelineEvent | undefined;
  previousRecord?: Policy | TimelineEvent;
  developments: readonly Development[];
  reviews: readonly SourceReview[];
}): { updates: { id: string; changes: Pick<Development, 'url' | 'verification'> }[]; problems: string[] } {
  const { review, record, previousRecord } = input;
  const problems: string[] = [];
  if (review.status !== 'published') problems.push(`${review.id} is ${review.status}, not published`);
  if (!review.decision?.approval) problems.push(`${review.id} has no passkey signature`);
  if (review.entryKind !== 'policy' && review.entryKind !== 'timeline_event')
    problems.push(`${review.id} publishes a ${review.entryKind}, which has no related developments`);
  const proposed = review.proposedRecord as Policy | TimelineEvent | undefined;
  if (!record || record.id !== proposed?.id) problems.push(`${review.id}: its record ${proposed?.id} is missing`);
  else if (
    record.verification.checkedAt !== review.reviewedAt ||
    record.verification.source.contentHash !== review.sourceEvidence?.contentHash
  )
    problems.push(`${record.id} has been re-verified since ${review.id}; renew from the later review`);

  let previousSource;
  if (previousRecord) {
    const expected = review.entryKind === 'policy' ? review.targetPolicyRevisionHash : review.targetTimelineRevisionHash;
    const actual =
      review.entryKind === 'policy'
        ? policyRevisionHash(previousRecord as Policy)
        : timelineRevisionHash(previousRecord as TimelineEvent);
    if (!expected || expected !== actual)
      problems.push(`the previous ${previousRecord.id} is not the revision ${review.id} was staged against`);
    previousSource = previousRecord.verification.source;
  }
  if (problems.length > 0) return { updates: [], problems };

  const ref: PublishedRecordRef = {
    kind: review.entryKind as PublishedRecordRef['kind'],
    id: record!.id,
    sourceUrl: record!.sourceUrl,
    verification: record!.verification,
  };
  const updates = developmentsRenewedByPublication(
    input.developments,
    ref,
    previousSource,
    linkedDevelopmentId(review),
    originDevelopmentIds(input.reviews, ref.id),
  )
    .filter((development) => development.verification?.checkedAt !== ref.verification.checkedAt)
    .map((development) => ({ id: development.id, changes: developmentRenewal(ref) }));
  return { updates, problems };
}
