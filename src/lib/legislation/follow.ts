import { createHash } from 'node:crypto';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { policyRevisionHash } from '@/lib/policy-revision';
import { sourceUrlsEqual } from '@/lib/source-url';
import { classifyFailure } from '@/lib/pipeline/failure';
import type { Policy, PolicyDate, PolicyDraft, SourceEvidence, SourceReview, SourceRunResult } from '@/types';
import { parseAphProgress } from './aph-progress';
import { parseNswBillDetail } from './nsw-progress';
import { parseSaBillSummaries, SA_BILL_PAGE, saBillSummaries } from './sa-salt';
import { parseTasBillProgress } from './tas-progress';
import { VIC_BILL_PAGE } from './vic-bills';
import { parseVicBillProgress } from './vic-progress';
import { parseWaBillProgress } from './wa-progress';
import {
  frlAmendedPrincipals,
  frlCommencements,
  frlTitleRecord,
  frlVersionsFrom,
  parseFrlPrincipals,
  parseFrlTitle,
  type FrlCommencement,
} from './frl-title';
import type { Dated, LawEvent, Legislative } from './model';
import { describeEvent } from './progress';
import { stageUpdate, type RegisterReading, type UnrecognisedStage } from './stage-update';

/**
 * Follow watches: each register bill with an APH id is read at its bill
 * home page, and each instrument with a Federal Register id at its title
 * record, on every collection run. A stage the record lacks, or a deadline
 * the register has set or moved, becomes one update review for Dan's
 * decision card. The record stays public while the review waits, because its
 * last approved stage is still true as of its date.
 */

export const FOLLOW_SOURCE_PREFIX = 'track:';

const APH_BILL_PAGE = 'https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=';

export type FollowRegister = 'aph' | 'frl' | 'tas' | 'sa' | 'vic' | 'nsw' | 'wa';

/** APH, NSW and WA bill pages are served only to a browser; the other registers answer plain HTTP. */
export const BROWSER_REGISTERS: ReadonlySet<FollowRegister> = new Set(['aph', 'nsw', 'wa']);

export interface FollowTarget {
  sourceId: string;
  url: string;
  register: FollowRegister;
  policy: Policy & { legislative: Legislative };
}

const READ: Record<FollowRegister, { title: string; read: (body: string, evidence: SourceEvidence) => RegisterReading }> = {
  aph: { title: 'Bill home page', read: parseAphProgress },
  frl: { title: 'Federal Register title record', read: parseFrlTitle },
  tas: { title: 'Parliament of Tasmania bill page', read: parseTasBillProgress },
  sa: { title: 'Parliament of South Australia bill summary', read: parseSaBillSummaries },
  vic: { title: 'Victorian Legislation bill page', read: parseVicBillProgress },
  nsw: { title: 'NSW Parliament bill page', read: parseNswBillDetail },
  wa: { title: 'WA Parliament bill progress page', read: parseWaBillProgress },
};

const NSW_BILL_PAGE = /^https:\/\/www\.parliament\.nsw\.gov\.au\/parliamentary-business\/bills\/bill-details\?billId=\d+$/;
const WA_BILL_PAGE = /^https:\/\/www\.parliament\.wa\.gov\.au\/parliament\/bills\.nsf\/BillProgressPopup\?OpenForm=&ParentUNID=[0-9A-F]{32}$/;
const TAS_BILL_PAGE = /^https:\/\/www\.parliament\.tas\.gov\.au\/bills\/bills\d{4}\//;

export function aphBillPage(billId: string): string {
  return `${APH_BILL_PAGE}${billId}`;
}

/**
 * Federal bills whose register source is their APH bill page, federal
 * instruments with a Federal Register title id, Tasmanian bills with a
 * Parliament of Tasmania bill page, SA bills with a SALT bill page, read
 * through the SALT API, and Victorian, NSW and WA bills with their bill
 * page.
 */
export function followTargets(policies: readonly Policy[]): FollowTarget[] {
  return policies.flatMap((policy): FollowTarget[] => {
    const legislative = policy.legislative;
    if (policy.status === 'trashed' || !legislative) return [];
    const sourceId = `${FOLLOW_SOURCE_PREFIX}${policy.id}`;
    const { ref } = legislative;
    if (legislative.kind === 'bill' && ref.register === 'aph') {
      const url = aphBillPage(ref.billId);
      if (!sourceUrlsEqual(policy.sourceUrl, url)) return [];
      return [{ sourceId, url, register: 'aph', policy: { ...policy, legislative } }];
    }
    if (legislative.kind === 'instrument' && ref.register === 'frl') {
      return [{ sourceId, url: frlTitleRecord(ref.titleId), register: 'frl', policy: { ...policy, legislative } }];
    }
    if (legislative.kind === 'bill' && ref.register === 'state' && ref.jurisdiction === 'tas' && TAS_BILL_PAGE.test(ref.url)) {
      return [{ sourceId, url: ref.url, register: 'tas', policy: { ...policy, legislative } }];
    }
    if (legislative.kind === 'bill' && ref.register === 'state' && ref.jurisdiction === 'vic' && VIC_BILL_PAGE.test(ref.url)) {
      return [{ sourceId, url: ref.url, register: 'vic', policy: { ...policy, legislative } }];
    }
    if (legislative.kind === 'bill' && ref.register === 'state' && ref.jurisdiction === 'nsw' && NSW_BILL_PAGE.test(ref.url)) {
      return [{ sourceId, url: ref.url, register: 'nsw', policy: { ...policy, legislative } }];
    }
    if (legislative.kind === 'bill' && ref.register === 'state' && ref.jurisdiction === 'wa' && WA_BILL_PAGE.test(ref.url)) {
      return [{ sourceId, url: ref.url, register: 'wa', policy: { ...policy, legislative } }];
    }
    const saBill = legislative.kind === 'bill' && ref.register === 'state' && ref.jurisdiction === 'sa' ? SA_BILL_PAGE.exec(ref.url) : null;
    if (saBill) {
      return [{ sourceId, url: saBillSummaries(saBill[1]), register: 'sa', policy: { ...policy, legislative } }];
    }
    return [];
  });
}

export interface FollowRun {
  targets: FollowTarget[];
  existingReviews: readonly SourceReview[];
  retrieve: (url: string, register: FollowRegister) => Promise<{ body: string; evidence: SourceEvidence }>;
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

  for (const { sourceId, url, register, policy } of run.targets) {
    const updates = run.existingReviews.filter((review) => review.targetPolicyId === policy.id && review.legislativeUpdate);
    if (updates.some((review) => review.status === 'approved')) {
      log(`[follow] ${sourceId}: a stage update is being published`);
      continue;
    }
    // The waiting update must be what the register shows now; once it is not,
    // the watch withdraws it, so no card waits on stages the register dropped.
    const waiting = updates.find((review) => review.status === 'pending_review');
    const withdraw = (because: string) => {
      if (!waiting) return;
      reviews.push({ ...waiting, status: 'rejected', rejectionReason: because, updatedAt: nowIso });
      log(`[follow] ${sourceId}: withdrew ${waiting.id}`);
    };
    const startedAt = Date.now();
    let retrieved: { body: string; evidence: SourceEvidence };
    try {
      retrieved = await run.retrieve(url, register);
    } catch (error) {
      const message = `${sourceId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      results.push(row(sourceId, startedAt, { error: message, failureClass: classifyFailure(error).cls, failedUrl: url }));
      log(`[follow] FAILED ${message}`);
      continue;
    }
    const { title, read } = READ[register];
    const evidence: SourceEvidence = { ...retrieved.evidence, title };
    let progress: (RegisterReading & { principal?: boolean }) | null = null;
    let unreadable = `the ${title.toLowerCase()} shows no stages; its format may have changed`;
    try {
      progress = read(retrieved.body, { url, title });
    } catch (error) {
      unreadable = error instanceof Error ? error.message : String(error);
    }
    if (!progress || progress.events.length === 0) {
      const message = `${sourceId}: ${unreadable}`;
      errors.push(message);
      results.push(row(sourceId, startedAt, { error: message, failureClass: 'parse', failedUrl: url }));
      log(`[follow] FAILED ${message}`);
      continue;
    }
    let scheduled: FrlCommencement | undefined;
    if (policy.legislative.ref.register === 'frl' && 'principal' in progress && progress.principal === false) {
      const registered = progress.events.find(({ event }) => event.kind === 'registered')?.date;
      let commencements: FrlCommencement[];
      try {
        commencements = await amendmentCommencements(policy.legislative.ref.titleId, registered ?? '1901-01-01', run.retrieve);
      } catch (error) {
        const message = `${sourceId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message);
        results.push(row(sourceId, startedAt, { error: message, failureClass: classifyFailure(error).cls }));
        log(`[follow] FAILED ${message}`);
        continue;
      }
      const today = nowIso.slice(0, 10);
      const commenced = commencements.filter((entry) => entry.date <= today);
      scheduled = commencements.find((entry) => entry.date > today);
      const source = progress.events[0].source;
      progress = {
        ...progress,
        events: [
          ...progress.events,
          ...commenced.map(({ date, principalId, provisions }, index): Dated<LawEvent> => ({
            date,
            precision: 'day',
            event: {
              kind: 'commenced',
              extent: !scheduled && index === commenced.length - 1 ? 'full' : 'partial',
              note: `${provisions ?? 'Amendments'} commence in ${principalId}`,
            },
            source,
          })),
        ],
      };
    }
    results.push(row(sourceId, startedAt));
    const update = stageUpdate(policy.legislative, policy.jurisdiction, progress);
    const { unrecognised } = progress;
    const recordedCommencement = policy.dates.find((date) => date.type === 'commenced');
    const commencementMoved =
      scheduled && String(recordedCommencement?.date ?? '').slice(0, 10) !== scheduled.date ? scheduled : undefined;
    const added = update.kind === 'unchanged' ? [] : update.added;
    const changed = update.kind === 'unchanged' ? [] : update.changed;
    const id = `source-review-follow-${policy.id}-${fingerprint({
      added,
      ...(changed.length > 0 ? { changed } : {}),
      unrecognised,
      ...(commencementMoved ? { scheduled: commencementMoved.date } : {}),
    })}`;
    if (waiting?.id === id) {
      log(`[follow] ${sourceId}: this stage update is waiting for a decision`);
      continue;
    }
    if (update.kind === 'unchanged' && !commencementMoved && unrecognised.every((stage) => shownBefore(stage, updates))) {
      withdraw('The register no longer shows this stage update.');
      log(`[follow] ${sourceId}: no new stage`);
      continue;
    }
    if (run.existingReviews.some((review) => review.id === id)) {
      withdraw('The register now shows a stage update that was already decided.');
      log(`[follow] ${sourceId}: this stage update was already decided`);
      continue;
    }
    withdraw(`Superseded by ${id}: the register now shows a different stage update.`);
    const on = (date: string) => formatPolicyDate({ type: 'published', date, precision: 'day' });
    const stages = added.map(({ date, event }) => `${describeEvent(event, policy.jurisdiction).label} on ${on(date)}`);
    const deadlines = changed.map(({ event }) =>
      event.kind === 'referred' && event.reportDue
        ? `the committee report is now due ${on(event.reportDue)}`
        : event.kind === 'tabled' && event.disallowanceEnds
          ? `the ${event.chamber === 'upper' ? 'Senate' : 'House'} disallowance window now ends ${on(event.disallowanceEnds)}`
          : `${event.kind} changed`,
    );
    const summary = [
      stages.length > 0 ? `${policy.title}: ${stages.join('; ')}.` : `${policy.title}: no new lifecycle stage.`,
      ...(deadlines.length > 0 ? [`Also, ${deadlines.join('; ')}.`] : []),
      ...(commencementMoved
        ? [
            `The Federal Register schedules ${commencementMoved.provisions ?? 'the amendments'} to commence in ${commencementMoved.principalId} on ${on(commencementMoved.date)}; ` +
              (recordedCommencement ? `the record says ${on(String(recordedCommencement.date).slice(0, 10))}.` : 'the record has no commencement date.'),
          ]
        : []),
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
      proposedRecord: proposedRecord(
        policy,
        {
          ...(update.kind === 'update' ? { legislative: update.legislative, status: update.status } : {}),
          ...(commencementMoved ? { dates: withCommencement(policy.dates, commencementMoved, progress.events[0].source) } : {}),
        },
        nowIso,
      ),
      legislativeUpdate: {
        added,
        ...(changed.length > 0 ? { changed } : {}),
        unrecognised,
        ...(commencementMoved ? { scheduledCommencement: commencementMoved.date } : {}),
        ...(update.kind === 'invalid' ? { error: update.error } : {}),
      },
      updatedAt: nowIso,
    });
    log(`[follow] ${sourceId}: staged ${id}`);
  }
  return { reviews, errors, results };
}

/** An earlier update already showed this stage, so it is not news on its own. */
function shownBefore(stage: UnrecognisedStage, updates: readonly SourceReview[]): boolean {
  return updates.some(
    (review) =>
      review.legislativeUpdate?.unrecognised.some(
        (shown) => shown.stage === stage.stage && shown.date === stage.date && shown.chamber === stage.chamber,
      ),
  );
}

/** When an amending instrument's provisions commence: read from the versions of each principal it amends. */
async function amendmentCommencements(
  titleId: string,
  registered: string,
  retrieve: FollowRun['retrieve'],
): Promise<FrlCommencement[]> {
  const principals = parseFrlPrincipals((await retrieve(frlAmendedPrincipals(titleId), 'frl')).body);
  const found: FrlCommencement[] = [];
  for (const principalId of principals) {
    found.push(...frlCommencements((await retrieve(frlVersionsFrom(principalId, registered), 'frl')).body, titleId));
  }
  return found.sort((a, b) => a.date.localeCompare(b.date));
}

/** The record's dates with its commencement moved to the day the register schedules. */
function withCommencement(dates: PolicyDate[], scheduled: FrlCommencement, source: SourceEvidence): PolicyDate[] {
  const commencement: PolicyDate = { type: 'commenced', date: scheduled.date, precision: 'day', source };
  return dates.some((date) => date.type === 'commenced')
    ? dates.map((date) => (date.type === 'commenced' ? { ...date, date: scheduled.date, precision: 'day', source } : date))
    : [...dates, commencement];
}
