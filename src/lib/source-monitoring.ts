import type {
  ManualSourceReview,
  SourceMonitoringState,
} from '@/types';
import type { WatchSource } from '@/lib/pipeline/sources';
import { VERIFICATION_CLOCK_SKEW_TOLERANCE_MS } from '@/lib/verification';
import { sourceUrlsEqual } from '@/lib/source-url';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ManualSourceCoverage {
  total: number;
  current: number;
  unavailable: number;
  overdue: number;
  neverReviewed: number;
}

function reviewIsCurrent(
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
  const maximumAge =
    source.schedule === 'daily' ? 2 * DAY_MS : 8 * DAY_MS;
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
    (source) => source.enabled && source.automation === 'manual',
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
