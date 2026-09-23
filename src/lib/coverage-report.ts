import { JURISDICTIONS } from '@/types';
import type { Jurisdiction, Policy, PolicyType, SourceReview } from '@/types';
import type { WatchSource } from '@/lib/pipeline/sources';

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

/**
 * Days since editorial re-verification before a public record counts as
 * overdue. Binding law changes fastest in effect; guidance slowest. This is
 * reported, never enforced: nothing fails because a record is old.
 */
export const RECORD_REVIEW_MAX_AGE_DAYS = {
  binding: 90,
  courtAndStandard: 180,
  other: 365,
} as const;

const COURT_AND_STANDARD_TYPES: ReadonlySet<PolicyType> = new Set([
  'practice_note',
  'standard',
]);

function recordReviewLimitDays(type: PolicyType): number {
  if (BINDING_TYPES.has(type)) return RECORD_REVIEW_MAX_AGE_DAYS.binding;
  if (COURT_AND_STANDARD_TYPES.has(type)) {
    return RECORD_REVIEW_MAX_AGE_DAYS.courtAndStandard;
  }
  return RECORD_REVIEW_MAX_AGE_DAYS.other;
}

export interface RecordFreshnessSummary {
  reviewed: number;
  overdue: number;
  overdueIds: string[];
  oldestAgeDays: number | null;
}

/**
 * Time since each public record was last re-verified against its source,
 * using `lastReviewedAt` and falling back to the verification check time.
 * Complements `audit:register`, which detects content drift, not age.
 */
export function summarizeRecordFreshness(
  policies: readonly Pick<
    Policy,
    'id' | 'type' | 'lastReviewedAt' | 'verification'
  >[],
  now: Date = new Date(),
): RecordFreshnessSummary {
  const overdueIds: string[] = [];
  let reviewed = 0;
  let oldestAgeDays: number | null = null;
  for (const policy of policies) {
    const reviewedAt = Date.parse(
      policy.lastReviewedAt ?? policy.verification.checkedAt ?? '',
    );
    if (Number.isNaN(reviewedAt)) {
      overdueIds.push(policy.id);
      continue;
    }
    reviewed += 1;
    const ageDays = Math.floor((now.getTime() - reviewedAt) / DAY_MS);
    oldestAgeDays = Math.max(oldestAgeDays ?? ageDays, ageDays);
    if (ageDays > recordReviewLimitDays(policy.type)) {
      overdueIds.push(policy.id);
    }
  }
  return { reviewed, overdue: overdueIds.length, overdueIds, oldestAgeDays };
}
