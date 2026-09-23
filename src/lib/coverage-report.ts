import { JURISDICTIONS } from '@/types';
import type { Jurisdiction, Policy, PolicyType, SourceReview } from '@/types';
import type { WatchSource } from '@/lib/pipeline/sources';
import { EDITORIAL_REVIEW_INTERVAL_DAYS } from '@/lib/verification';

const DAY_MS = 24 * 60 * 60 * 1000;
const BINDING_TYPES: ReadonlySet<PolicyType> = new Set([
  'legislation',
  'regulation',
]);

export interface JurisdictionCoverage {
  jurisdiction: Jurisdiction;
  publicRecords: number;
  bindingRecords: number;
  automaticSources: number;
  manualSources: number;
}

/**
 * Counts of records that exist and sources that watch each jurisdiction.
 * This measures what Policai tracks, not coverage of the world.
 */
export function buildJurisdictionCoverage(
  policies: readonly Policy[],
  sources: readonly WatchSource[],
): JurisdictionCoverage[] {
  return JURISDICTIONS.map((jurisdiction) => {
    const records = policies.filter(
      (policy) => policy.jurisdiction === jurisdiction,
    );
    const watching = sources.filter(
      (source) => source.enabled && source.jurisdiction === jurisdiction,
    );
    return {
      jurisdiction,
      publicRecords: records.length,
      bindingRecords: records.filter((policy) => BINDING_TYPES.has(policy.type))
        .length,
      automaticSources: watching.filter(
        (source) => source.automation === 'automatic',
      ).length,
      manualSources: watching.filter((source) => source.automation === 'manual')
        .length,
    };
  });
}

export function summarizeReviewQueue(
  pending: readonly Pick<SourceReview, 'discoveredAt'>[],
  now: Date = new Date(),
): { pending: number; oldestAgeDays: number | null } {
  const times = pending
    .map((review) => Date.parse(review.discoveredAt))
    .filter((time) => !Number.isNaN(time));
  return {
    pending: pending.length,
    oldestAgeDays:
      times.length === 0
        ? null
        : Math.floor((now.getTime() - Math.min(...times)) / DAY_MS),
  };
}

export interface RecordFreshnessSummary {
  reviewed: number;
  overdue: number;
  overdueIds: string[];
  oldestAgeDays: number | null;
}

/**
 * Time since each public record was last verified by an editor. A record past
 * EDITORIAL_REVIEW_INTERVAL_DAYS stays published but is shown as "Review due"
 * (see projectVerificationForPublic); this is the same rule. Complements
 * `audit:register`, which detects content drift, not age.
 */
export function summarizeRecordFreshness(
  policies: readonly Pick<
    Policy,
    'id' | 'title' | 'type' | 'lastReviewedAt' | 'verification'
  >[],
  now: Date = new Date(),
): RecordFreshnessSummary {
  const schedule = buildRecordReviewSchedule(policies, now);
  const overdueIds = schedule
    .filter((row) => row.overdue)
    .map((row) => row.id)
    .sort();
  const ages = schedule
    .filter((row) => row.daysLeft !== null)
    .map((row) => EDITORIAL_REVIEW_INTERVAL_DAYS - row.daysLeft!);
  return {
    reviewed: ages.length,
    overdue: overdueIds.length,
    overdueIds,
    oldestAgeDays: ages.length ? Math.max(...ages) : null,
  };
}

export interface RecordReviewRow {
  id: string;
  title: string;
  type: PolicyType;
  /** ISO time of the last editorial re-verification, or null if none. */
  reviewedAt: string | null;
  /** ISO date the record becomes overdue, or null if never reviewed. */
  dueAt: string | null;
  /** Days until due; negative when overdue, null if never reviewed. */
  daysLeft: number | null;
  overdue: boolean;
}

/**
 * Every public record with its re-verification due date, soonest first.
 * Never-reviewed records sort first and count as overdue.
 */
export function buildRecordReviewSchedule(
  policies: readonly Pick<
    Policy,
    'id' | 'title' | 'type' | 'lastReviewedAt' | 'verification'
  >[],
  now: Date = new Date(),
): RecordReviewRow[] {
  const rows = policies.map((policy): RecordReviewRow => {
    // The public "Review due" projection keys off verification.checkedAt, so
    // the schedule does too; lastReviewedAt is only a fallback.
    const reviewedAt = policy.verification.checkedAt ?? policy.lastReviewedAt ?? null;
    const reviewedTime = Date.parse(reviewedAt ?? '');
    if (Number.isNaN(reviewedTime)) {
      return {
        id: policy.id,
        title: policy.title,
        type: policy.type,
        reviewedAt: null,
        dueAt: null,
        daysLeft: null,
        overdue: true,
      };
    }
    const limitDays = EDITORIAL_REVIEW_INTERVAL_DAYS;
    const dueTime = reviewedTime + limitDays * DAY_MS;
    const ageDays = Math.floor((now.getTime() - reviewedTime) / DAY_MS);
    return {
      id: policy.id,
      title: policy.title,
      type: policy.type,
      reviewedAt,
      dueAt: new Date(dueTime).toISOString(),
      daysLeft: limitDays - ageDays,
      overdue: ageDays > limitDays,
    };
  });
  return rows.sort(
    (a, b) =>
      (a.daysLeft ?? Number.NEGATIVE_INFINITY) -
        (b.daysLeft ?? Number.NEGATIVE_INFINITY) || a.id.localeCompare(b.id),
  );
}

/**
 * Fields a public record must carry (gated by `validate:data`) versus fields
 * it is expected to carry (reported only). Completeness measures the records
 * that exist, not how much of Australian AI policy the register covers.
 */
export const EXPECTED_RECORD_FIELDS = [
  'agencies',
  'tags',
  'primaryDateSource',
  'reviewStamp',
] as const;

export type ExpectedRecordField = (typeof EXPECTED_RECORD_FIELDS)[number];

export const EXPECTED_RECORD_FIELD_LABELS: Record<ExpectedRecordField, string> = {
  agencies: 'Responsible agency',
  tags: 'Topic tags',
  primaryDateSource: 'Source evidence for the primary date',
  reviewStamp: 'Editorial review stamp',
};

export interface RecordCompletenessSummary {
  total: number;
  complete: number;
  missing: Record<ExpectedRecordField, string[]>;
}

function missingExpectedFields(
  policy: Pick<Policy, 'agencies' | 'tags' | 'dates' | 'lastReviewedAt'>,
): ExpectedRecordField[] {
  const missing: ExpectedRecordField[] = [];
  if (!policy.agencies?.some((agency) => agency.trim())) missing.push('agencies');
  if (!policy.tags?.some((tag) => tag.trim())) missing.push('tags');
  const primary = policy.dates?.find((date) => date.primary) ?? policy.dates?.[0];
  if (!primary?.source?.url) missing.push('primaryDateSource');
  if (!policy.lastReviewedAt) missing.push('reviewStamp');
  return missing;
}

export function summarizeRecordCompleteness(
  policies: readonly Pick<
    Policy,
    'id' | 'agencies' | 'tags' | 'dates' | 'lastReviewedAt'
  >[],
): RecordCompletenessSummary {
  const missing = Object.fromEntries(
    EXPECTED_RECORD_FIELDS.map((field) => [field, [] as string[]]),
  ) as Record<ExpectedRecordField, string[]>;
  let complete = 0;
  for (const policy of policies) {
    const gaps = missingExpectedFields(policy);
    if (gaps.length === 0) complete += 1;
    for (const field of gaps) missing[field].push(policy.id);
  }
  return { total: policies.length, complete, missing };
}
