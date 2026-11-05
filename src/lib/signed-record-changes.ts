import type { EditorApprovalState } from '@/lib/editor-approval-validation';
import {
  PUBLISHED_RECORDS,
  type PublishedRecordFiles,
  type PublishedRecordRule,
} from '@/lib/published-records';
import { linkedDevelopmentId } from '@/lib/source-review';
import type { Policy, SourceReview, TimelineEvent } from '@/types';

export type SignedRecordState = EditorApprovalState & PublishedRecordFiles;

interface Approved {
  reviewId: string;
  content: string;
}

function approve(approvals: Map<string, Approved[]>, id: string, approved: Approved): void {
  approvals.set(id, [...(approvals.get(id) ?? []), approved]);
}

/** What the decisions signed on this branch allow to change. */
interface SignedChanges {
  /** Record id to the content each source review signed here approved for it. */
  policies: Map<string, Approved[]>;
  timeline: Map<string, Approved[]>;
  /** Policies whose verification a reconfirm batch renewed. */
  renewedPolicies: Set<string>;
  /** Developments a signed publication promotes or links to its record. */
  developments: Set<string>;
}

/**
 * A source review's decision is signed on this branch when it is new here, or
 * when this branch completes the publication of a decision signed earlier.
 */
function signedOnBranch(review: SourceReview, base: SourceReview | undefined): boolean {
  if (!review.decision?.approval) return false;
  if (base?.decision?.proposalHash !== review.decision.proposalHash) return true;
  return base.status !== 'published' && review.status === 'published';
}

function signedChanges(head: SignedRecordState, base: SignedRecordState): SignedChanges {
  const changes: SignedChanges = {
    policies: new Map(),
    timeline: new Map(),
    renewedPolicies: new Set(),
    developments: new Set(),
  };
  const baseReviews = new Map(base.sourceReviews.map((review) => [review.id, review]));
  for (const review of head.sourceReviews) {
    if (!signedOnBranch(review, baseReviews.get(review.id))) continue;
    const record = review.proposedRecord;
    if (review.entryKind === 'timeline_event') {
      approve(changes.timeline, record.id, {
        reviewId: review.id,
        content: PUBLISHED_RECORDS.timeline.readerContent(record as TimelineEvent),
      });
    } else {
      approve(changes.policies, record.id, {
        reviewId: review.id,
        content: PUBLISHED_RECORDS.policies.readerContent(record as Policy),
      });
    }
    const developmentId = linkedDevelopmentId(review);
    if (developmentId) changes.developments.add(developmentId);
  }
  const decidedInBase = new Set(base.reconfirmBatches.filter((batch) => batch.decision).map((batch) => batch.id));
  for (const batch of head.reconfirmBatches) {
    if (!batch.decision?.approval || decidedInBase.has(batch.id)) continue;
    for (const entry of batch.entries) changes.renewedPolicies.add(entry.policyId);
  }
  for (const development of head.developments) {
    if (
      (development.relatedPolicyId && changes.policies.has(development.relatedPolicyId)) ||
      (development.relatedTimelineEventId && changes.timeline.has(development.relatedTimelineEventId))
    ) {
      changes.developments.add(development.id);
    }
  }
  return changes;
}

/** True when `head` differs from `base` only in what a reconfirm approval writes. */
function onlyRenewed(head: Policy, base: Policy): boolean {
  const renewal = {
    lastReviewedAt: base.lastReviewedAt,
    verification: {
      ...head.verification,
      checkedAt: base.verification.checkedAt,
      checkedBy: base.verification.checkedBy,
      notes: base.verification.notes,
    },
  };
  return PUBLISHED_RECORDS.policies.readerContent({ ...head, ...renewal }) === PUBLISHED_RECORDS.policies.readerContent(base);
}

function changedPublishedRecords<R extends { id: string }>(
  rule: PublishedRecordRule<R>,
  head: readonly R[],
  base: readonly R[],
): { head: R; base?: R }[] {
  const baseById = new Map(base.map((record) => [record.id, record]));
  return head.flatMap((record) => {
    if (!rule.isPublished(record)) return [];
    const before = baseById.get(record.id);
    return before && rule.readerContent(before) === rule.readerContent(record) ? [] : [{ head: record, base: before }];
  });
}

const UNSIGNED =
  'a published record changed without a decision signed on this branch; stage a source review for the change and have the editor approve it with their passkey';

/** Errors for changed published records that no signed source review approved as they now stand. */
function unapprovedChanges<R extends { id: string }>(
  label: string,
  rule: PublishedRecordRule<R>,
  head: readonly R[],
  base: readonly R[],
  approvals: Map<string, Approved[]>,
  renewed: (head: R, base?: R) => boolean = () => false,
): string[] {
  return changedPublishedRecords(rule, head, base).flatMap((change) => {
    const approved = approvals.get(change.head.id) ?? [];
    const content = rule.readerContent(change.head);
    if (approved.some((approval) => approval.content === content) || renewed(change.head, change.base)) return [];
    return [
      approved.length > 0
        ? `${label}:${change.head.id}: differs from what source review ${approved.map((approval) => approval.reviewId).join(' or ')} approved`
        : `${label}:${change.head.id}: ${UNSIGNED}`,
    ];
  });
}

/**
 * A pull request may change what readers see of a published record only
 * through a decision the editor signs in that pull request: a source review
 * publication, whose record must match what was approved, or a reconfirm
 * batch, which may only renew verification. Unpublished records (collector
 * detections, staged drafts, trashed or stale records) and withdrawals need
 * no signature. Signatures themselves are checked by validateEditorApprovals.
 */
export function validateSignedRecordChanges(
  head: SignedRecordState,
  base: SignedRecordState | null,
): { errors: string[]; warnings: string[] } {
  if (!base || head.passkeys.length === 0) return { errors: [], warnings: [] };
  const signed = signedChanges(head, base);
  const errors = [
    ...unapprovedChanges('policies', PUBLISHED_RECORDS.policies, head.policies, base.policies, signed.policies, (policy, before) =>
      Boolean(before && signed.renewedPolicies.has(policy.id) && onlyRenewed(policy, before)),
    ),
    ...unapprovedChanges('timeline', PUBLISHED_RECORDS.timeline, head.timeline, base.timeline, signed.timeline),
    ...changedPublishedRecords(PUBLISHED_RECORDS.developments, head.developments, base.developments)
      .filter((change) => !signed.developments.has(change.head.id))
      .map((change) => `developments:${change.head.id}: ${UNSIGNED}`),
  ];
  return { errors, warnings: [] };
}
