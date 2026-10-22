import { createHash } from 'node:crypto';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { policyRevisionHash } from '@/lib/policy-revision';
import { sourceUrlsEqual } from '@/lib/source-url';
import { classifyFailure } from '@/lib/pipeline/failure';
import type { Policy, PolicyDraft, SourceEvidence, SourceReview, SourceRunResult } from '@/types';
import { parseAphProgress, stageUpdate } from './aph-progress';
import type { Legislative } from './model';
import { describeEvent } from './progress';

/**
 * Follow watches: each register bill with an APH id is read at its bill
 * home page on every collection run. A stage the record lacks becomes one
 * update review for Dan's decision card. The record stays public while the
 * review waits, because its last approved stage is still true as of its date.
 */

export const FOLLOW_SOURCE_PREFIX = 'track:';

const APH_BILL_PAGE = 'https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=';

type Bill = Extract<Legislative, { kind: 'bill' }>;

export interface FollowTarget {
  sourceId: string;
  url: string;
  policy: Policy & { legislative: Bill };
}

export function aphBillPage(billId: string): string {
  return `${APH_BILL_PAGE}${billId}`;
}

/** Live and made federal bills whose register source is their APH bill page. */
export function followTargets(policies: readonly Policy[]): FollowTarget[] {
  return policies.flatMap((policy) => {
    const legislative = policy.legislative;
    if (policy.status === 'trashed' || legislative?.kind !== 'bill' || legislative.ref.register !== 'aph') return [];
    const url = aphBillPage(legislative.ref.billId);
    if (!sourceUrlsEqual(policy.sourceUrl, url)) return [];
    return [{ sourceId: `${FOLLOW_SOURCE_PREFIX}${policy.id}`, url, policy: { ...policy, legislative } }];
  });
}

export interface FollowRun {
  targets: FollowTarget[];
  existingReviews: readonly SourceReview[];
  retrieve: (url: string) => Promise<{ body: string; evidence: SourceEvidence }>;
  now: Date;
  log?: (message: string) => void;
}

export interface FollowResult {
  reviews: SourceReview[];
  errors: string[];
  /** One row per watch, for the source health ledger. */
  results: SourceRunResult[];
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function proposedRecord(policy: Policy, changes: Partial<Policy>, nowIso: string): PolicyDraft {
  const draft: Partial<Policy> = { ...policy, ...changes, updatedAt: nowIso };
  delete draft.verification;
  delete draft.lastReviewedAt;
  return draft as PolicyDraft;
}

export async function followLegislation(run: FollowRun): Promise<FollowResult> {
  const log = run.log ?? (() => {});
  const nowIso = run.now.toISOString();
  const reviews: SourceReview[] = [];
  const errors: string[] = [];
  const results: SourceRunResult[] = [];
  const row = (sourceId: string, startedAt: number, failure?: Pick<SourceRunResult, 'error' | 'failureClass' | 'failedUrl'>): SourceRunResult => ({
    sourceId,
    status: failure ? 'error' : 'success',
    checkedAt: nowIso,
    durationMs: Date.now() - startedAt,
    itemCount: failure ? null : 1,
    candidateCount: 0,
    newCandidateCount: 0,
    ...failure,
  });

  for (const { sourceId, url, policy } of run.targets) {
    const waiting = run.existingReviews.some(
      (review) =>
        review.targetPolicyId === policy.id &&
        review.legislativeUpdate &&
        (review.status === 'pending_review' || review.status === 'approved'),
    );
    if (waiting) {
      log(`[follow] ${sourceId}: a stage update is already waiting for a decision`);
      continue;
    }
    const startedAt = Date.now();
    let retrieved: { body: string; evidence: SourceEvidence };
    try {
      retrieved = await run.retrieve(url);
    } catch (error) {
      const message = `${sourceId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      results.push(row(sourceId, startedAt, { error: message, failureClass: classifyFailure(error).cls, failedUrl: url }));
      log(`[follow] FAILED ${message}`);
      continue;
    }
    const evidence: SourceEvidence = { ...retrieved.evidence, title: 'Bill home page' };
    const progress = parseAphProgress(retrieved.body, { url, title: 'Bill home page' });
    if (progress.events.length === 0) {
      const message = `${sourceId}: the bill page has no Progress stages; its markup may have changed`;
      errors.push(message);
      results.push(row(sourceId, startedAt, { error: message, failureClass: 'parse', failedUrl: url }));
      log(`[follow] FAILED ${message}`);
      continue;
    }
    results.push(row(sourceId, startedAt));
    const update = stageUpdate(policy.legislative, policy.jurisdiction, progress);
    const { unrecognised } = progress;
    if (update.kind === 'unchanged' && unrecognised.length === 0) {
      log(`[follow] ${sourceId}: no new stage`);
      continue;
    }
    const added = update.kind === 'unchanged' ? [] : update.added;
    const id = `source-review-follow-${policy.id}-${fingerprint({ added, unrecognised })}`;
    if (run.existingReviews.some((review) => review.id === id)) {
      log(`[follow] ${sourceId}: this stage update was already decided`);
      continue;
    }
    const on = (date: string) => formatPolicyDate({ type: 'published', date, precision: 'day' });
    const stages = added.map(({ date, event }) => `${describeEvent(event, policy.jurisdiction).label} on ${on(date)}`);
    const summary = [
      stages.length > 0 ? `${policy.title}: ${stages.join('; ')}.` : `${policy.title}: no new lifecycle stage.`,
      ...unrecognised.map((stage) => `The page also shows "${stage.stage}" on ${on(stage.date)}, which has no lifecycle meaning yet; read the page.`),
      ...(update.kind === 'invalid' ? [`Not applied: ${update.error}. Read the page and correct the record by hand.`] : []),
    ].join(' ');
    reviews.push({
      id,
      sourceUrl: policy.sourceUrl,
      title: policy.title,
      entryKind: 'policy',
      targetPolicyId: policy.id,
      targetPolicyBaseRevisionHash: policyRevisionHash(policy),
      status: 'pending_review',
      discoveredAt: nowIso,
      createdBy: 'collector',
      notes: `${summary} Detected by the follow watch ${sourceId}.`,
      analysis: {
        isRelevant: true,
        relevanceScore: 1,
        suggestedType: policy.type,
        suggestedJurisdiction: policy.jurisdiction,
        summary,
        tags: policy.tags,
        agencies: policy.agencies,
      },
      sourceEvidence: evidence,
      proposedRecord:
        update.kind === 'update'
          ? proposedRecord(policy, { legislative: update.legislative, status: update.status }, nowIso)
          : proposedRecord(policy, {}, nowIso),
      legislativeUpdate: {
        added,
        unrecognised,
        ...(update.kind === 'invalid' ? { error: update.error } : {}),
      },
      updatedAt: nowIso,
    });
    log(`[follow] ${sourceId}: staged ${id}`);
  }
  return { reviews, errors, results };
}
