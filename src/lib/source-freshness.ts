import type { WatchSource } from '@/lib/pipeline/sources';

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
): SourceFreshness[] {
  return sources
    .filter((source) => source.enabled)
    .map((source): SourceFreshness => {
      const raw = lastCheckedBySource[source.id];
      const parsed = raw ? Date.parse(raw) : Number.NaN;
      const lastCheckedAt = Number.isNaN(parsed) ? null : raw;
      const ageDays =
        lastCheckedAt === null
          ? null
          : Math.floor((now.getTime() - parsed) / DAY_MS);
      let state: SourceFreshnessState;
      if (source.automation === 'manual') state = 'manual';
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

export function summarizeSourceFreshness(rows: readonly SourceFreshness[]) {
  return {
    current: rows.filter((row) => row.state === 'current').length,
    overdue: rows.filter((row) => row.state === 'overdue').length,
    neverChecked: rows.filter((row) => row.state === 'never_checked').length,
    manual: rows.filter((row) => row.state === 'manual').length,
  };
}
