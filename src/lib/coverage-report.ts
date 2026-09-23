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
