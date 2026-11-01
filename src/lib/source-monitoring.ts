import type {
  ManualSourceReview,
  SourceMonitoringState,
} from '@/types';
import type { WatchSource } from '@/lib/pipeline/sources';
import { VERIFICATION_CLOCK_SKEW_TOLERANCE_MS } from '@/lib/verification';
import { sourceUrlsEqual } from '@/lib/source-url';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a hand check stays current. Daily sources: 2 days. Weekly: 8.
 * The same limits decide that a manual source with no current review has
 * gone unchecked.
 */
export const MANUAL_REVIEW_LIMIT_DAYS = { daily: 2, weekly: 8 } as const;

export interface ManualSourceCoverage {
  total: number;
  current: number;
  unavailable: number;
  overdue: number;
  neverReviewed: number;
}

export function reviewIsCurrent(
  source: WatchSource,
  review: ManualSourceReview,
  now: Date,
): boolean {
  if (
    !review.evidence?.url ||
    !sourceUrlsEqual(review.evidence.url, source.url) ||
    !review.notes?.trim() ||
    review.notes.trim().length < 20
  ) {
    return false;
  }
  const maximumAge = MANUAL_REVIEW_LIMIT_DAYS[source.schedule] * DAY_MS;
  const age =
    now.getTime() - new Date(review.reviewedAt).getTime();
  return (
    age >= -VERIFICATION_CLOCK_SKEW_TOLERANCE_MS &&
    age <= maximumAge
  );
}

export function summarizeManualSourceCoverage(
  sources: WatchSource[],
  monitoring: SourceMonitoringState,
  now = new Date(),
): ManualSourceCoverage {
  const manualSources = sources.filter(
    (source) => source.enabled && source.automation !== 'automatic',
  );
  const reviewBySource = new Map(
    monitoring.manualReviews.map((review) => [review.sourceId, review]),
  );
  let current = 0;
  let unavailable = 0;
  let overdue = 0;
  let neverReviewed = 0;

  for (const source of manualSources) {
    const review = reviewBySource.get(source.id);
    if (!review) {
      neverReviewed++;
      continue;
    }
    if (review.status === 'source_unavailable') {
      if (reviewIsCurrent(source, review, now)) unavailable++;
      else overdue++;
      continue;
    }
    if (reviewIsCurrent(source, review, now)) current++;
    else overdue++;
  }

  return {
    total: manualSources.length,
    current,
    unavailable,
    overdue,
    neverReviewed,
  };
}
