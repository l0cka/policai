import type { SourceRunResult } from '@/types';
import type { FailureClass } from './failure';

/**
 * Per-source reach history, kept in watch-state so one standing failure
 * cannot hide whether every other source is still being reached.
 */
export interface SourceHealthRecord {
  lastSuccessAt: string | null;
  firstFailureAt: string | null;
  consecutiveFailures: number;
  lastFailureClass: FailureClass | null;
}

/**
 * Folds one run's rows into the ledger. Skipped sources and candidate-only
 * retries (the index was not due) say nothing about reach, so they leave
 * their record as it was.
 */
export function advanceSourceHealth(
  ledger: Readonly<Record<string, SourceHealthRecord>>,
  results: readonly SourceRunResult[],
): Record<string, SourceHealthRecord> {
  const next = { ...ledger };
  for (const row of results) {
    if (row.status === 'skipped' || row.coverageEligible === false) continue;
    const previous = next[row.sourceId];
    next[row.sourceId] =
      row.status === 'success'
        ? {
            lastSuccessAt: row.checkedAt,
            firstFailureAt: null,
            consecutiveFailures: 0,
            lastFailureClass: null,
          }
        : {
            lastSuccessAt: previous?.lastSuccessAt ?? null,
            firstFailureAt: previous?.firstFailureAt ?? row.checkedAt,
            consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
            lastFailureClass: row.failureClass ?? 'other',
          };
  }
  return next;
}

export interface UnreachedSource {
  sourceId: string;
  lastSuccessAt: string | null;
  firstFailureAt: string;
  consecutiveFailures: number;
  lastFailureClass: FailureClass | null;
}

/**
 * The automatic sources the weekly window cannot vouch for: still failing,
 * with no success at or after the anchor run. Longest-failing first.
 */
export function sourcesNotReachedSince(
  anchor: string | null,
  ledger: Readonly<Record<string, SourceHealthRecord>>,
  automaticSourceIds: readonly string[],
): UnreachedSource[] {
  const anchorMs = anchor ? Date.parse(anchor) : Number.NaN;
  return automaticSourceIds
    .flatMap((sourceId): UnreachedSource[] => {
      const record = ledger[sourceId];
      if (!record?.firstFailureAt || record.consecutiveFailures === 0) return [];
      if (
        record.lastSuccessAt &&
        !Number.isNaN(anchorMs) &&
        Date.parse(record.lastSuccessAt) >= anchorMs
      )
        return [];
      return [{ sourceId, ...record, firstFailureAt: record.firstFailureAt }];
    })
    .sort((a, b) => a.firstFailureAt.localeCompare(b.firstFailureAt));
}
