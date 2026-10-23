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

/** Failed runs in a row after which the collector proposes a move to manual. */
export const MANUAL_PROPOSAL_FAILURES = 3;

/**
 * Automatic sources that have failed MANUAL_PROPOSAL_FAILURES runs in a row.
 * Each is only a proposal: a person decides, and nothing moves on its own.
 */
export function manualMoveProposals(
  ledger: Readonly<Record<string, SourceHealthRecord>>,
  automaticSourceIds: readonly string[],
): UnreachedSource[] {
  return sourcesNotReachedSince(null, ledger, automaticSourceIds).filter(
    (source) => source.consecutiveFailures >= MANUAL_PROPOSAL_FAILURES,
  );
}

const PROPOSAL_TITLE = /^Collector proposal: move (\S+) to manual$/;

export function manualProposalTitle(sourceId: string): string {
  return `Collector proposal: move ${sourceId} to manual`;
}

/**
 * Which proposal issues to open and which to close, so that exactly one is
 * open per current proposal. A source that recovered or was already moved
 * drops out of the proposals, and its issue closes.
 */
export function proposalIssueChanges(
  proposals: readonly UnreachedSource[],
  openIssues: readonly { number: number; title: string }[],
): { open: UnreachedSource[]; close: number[] } {
  const proposed = new Set(proposals.map((proposal) => proposal.sourceId));
  const issued = new Set<string>();
  const close: number[] = [];
  for (const issue of openIssues) {
    const sourceId = PROPOSAL_TITLE.exec(issue.title)?.[1];
    if (!sourceId) continue;
    if (proposed.has(sourceId) && !issued.has(sourceId)) issued.add(sourceId);
    else close.push(issue.number);
  }
  return {
    open: proposals.filter((proposal) => !issued.has(proposal.sourceId)),
    close,
  };
}
