import { UNCHECKED_SOURCE_MARKER } from '@/lib/collection-coverage';
import type { WatchSource } from '@/lib/pipeline/sources';
import { reviewIsCurrent } from '@/lib/source-monitoring';
import type { SourceMonitoringState } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days since the collector last completed a check before an automatic
 * source counts as overdue. Nominal cadence plus slack for a missed run.
 */
export const FRESHNESS_LIMIT_DAYS = { daily: 3, weekly: 10 } as const;

export type SourceFreshnessState =
  | 'current'
  | 'overdue'
  | 'never_checked'
  | 'manual';

export interface SourceFreshness {
  sourceId: string;
  name: string;
  jurisdiction: WatchSource['jurisdiction'];
  schedule: WatchSource['schedule'];
  lastCheckedAt: string | null;
  ageDays: number | null;
  state: SourceFreshnessState;
}

const STATE_ORDER: Record<SourceFreshnessState, number> = {
  overdue: 0,
  never_checked: 1,
  current: 2,
  manual: 3,
};

/**
 * Freshness from watch-state `lastCheckedBySource`, which advances only when
 * a check completes. Unlike a run's `status: success`, it does not advance
 * while a document change is deferred for review.
 */
export function assessSourceFreshness(
  sources: readonly WatchSource[],
  lastCheckedBySource: Readonly<Record<string, string>>,
  now: Date = new Date(),
  monitoring: SourceMonitoringState = { manualReviews: [] },
): SourceFreshness[] {
  return sources
    .filter((source) => source.enabled)
    .map((source): SourceFreshness => {
      const review = monitoring.manualReviews.find(
        (entry) => entry.sourceId === source.id,
      );
      // The collector never fetches a manual source, so its watch-state
      // check time is not the age that matters: a person's last review is.
      const raw =
        source.automation === 'automatic'
          ? lastCheckedBySource[source.id]
          : review?.reviewedAt;
      const parsed = raw ? Date.parse(raw) : Number.NaN;
      const lastCheckedAt = Number.isNaN(parsed) ? null : raw!;
      const ageDays =
        lastCheckedAt === null
          ? null
          : Math.floor((now.getTime() - parsed) / DAY_MS);
      const manualCurrent =
        source.automation !== 'automatic' &&
        review !== undefined &&
        reviewIsCurrent(source, review, now);
      let state: SourceFreshnessState;
      if (manualCurrent) state = 'manual';
      else if (source.automation !== 'automatic') state = 'overdue';
      else if (ageDays === null) state = 'never_checked';
      else if (ageDays > FRESHNESS_LIMIT_DAYS[source.schedule]) state = 'overdue';
      else state = 'current';
      return {
        sourceId: source.id,
        name: source.name,
        jurisdiction: source.jurisdiction,
        schedule: source.schedule,
        lastCheckedAt,
        ageDays,
        state,
      };
    })
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        (b.ageDays ?? 0) - (a.ageDays ?? 0),
    );
}

/**
 * Automatic sources the collector must name because it has not completed a
 * check inside {@link FRESHNESS_LIMIT_DAYS} (3 days daily, 10 weekly).
 * A manual source is excluded: its staleness is a person's backlog, shown
 * on /status, and must not hold every run at degraded and bury real
 * failures.
 */
export function uncheckedSourceErrors(
  sources: readonly WatchSource[],
  lastCheckedBySource: Readonly<Record<string, string>>,
  monitoring: SourceMonitoringState,
  now: Date = new Date(),
): string[] {
  const automaticIds = new Set(
    sources
      .filter((source) => source.automation === 'automatic')
      .map((source) => source.id),
  );
  return assessSourceFreshness(sources, lastCheckedBySource, now, monitoring)
    .filter(
      (row) =>
        automaticIds.has(row.sourceId) &&
        (row.state === 'overdue' || row.state === 'never_checked'),
    )
    .map((row) => {
      const limit = FRESHNESS_LIMIT_DAYS[row.schedule];
      const age =
        row.ageDays === null
          ? 'never checked'
          : `last checked ${row.ageDays} day${row.ageDays === 1 ? '' : 's'} ago`;
      return `${row.sourceId}${UNCHECKED_SOURCE_MARKER}${age}; limit ${limit} days, ${row.schedule})`;
    });
}

export function summarizeSourceFreshness(rows: readonly SourceFreshness[]) {
  return {
    current: rows.filter((row) => row.state === 'current').length,
    overdue: rows.filter((row) => row.state === 'overdue').length,
    neverChecked: rows.filter((row) => row.state === 'never_checked').length,
    manual: rows.filter((row) => row.state === 'manual').length,
  };
}
