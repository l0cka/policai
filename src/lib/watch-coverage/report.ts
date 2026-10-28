import type { Jurisdiction, SkippedLinked, SourceMonitoringState, SourceRunResult } from '@/types';
import { JURISDICTIONS } from '@/types';
import type { FailureClass } from '@/lib/pipeline/failure';
import type { SourceHealthRecord } from '@/lib/pipeline/source-health';
import type { ManualBecause, ManualDecision, WatchSource } from '@/lib/pipeline/sources';
import { reviewIsCurrent } from '@/lib/source-monitoring';
import type { Body, BodyId, Tier } from './bodies';

/** What one enabled source contributes to its body's coverage. */
export type SourceStanding =
  | { kind: 'ok'; lastSuccessAt: string }
  | { kind: 'failing'; since: string; runs: number; cls: FailureClass }
  | { kind: 'refusal_undecided'; since: string; runs: number; cls: 'identity_refused' | 'robots_disallowed' }
  | {
      kind: 'manual';
      because: ManualBecause;
      decision: ManualDecision['decision'];
      lastReviewedAt: string | null;
      overdue: boolean;
    }
  | { kind: 'not_yet_run' };

/** `pending`: every source is newly admitted and not yet checked. */
export type BodyCoverage = 'automatic' | 'manual' | 'failing' | 'pending' | 'uncovered';

export interface WatchCoverageCell {
  jurisdiction: Jurisdiction;
  tier: Tier;
  bodies: number;
  automatic: number;
  manual: number;
  failing: number;
  pending: number;
  uncovered: number;
}

export interface WatchCoverageReport {
  asOf: string;
  cells: WatchCoverageCell[];
  /** In-scope bodies with no working source, tier A first. */
  gaps: Array<{ bodyId: BodyId; name: string; jurisdiction: Jurisdiction; tier: Tier; coverage: 'failing' | 'pending' | 'uncovered' }>;
  blocks: Array<{ sourceId: string; bodyId: string; automation: ManualDecision; lastReviewedAt: string | null; overdue: boolean }>;
  undecidedRefusals: Array<{ sourceId: string; since: string; runs: number; cls: FailureClass }>;
  skippedLinked: Array<SkippedLinked & { sourceId: string }>;
  /** Bodies whose scope nobody has decided yet; counted as in scope. */
  unassessed: number;
}

export interface WatchCoverageInput {
  bodies: readonly Body[];
  sources: readonly WatchSource[];
  sourceHealth: Readonly<Record<string, SourceHealthRecord>>;
  /** `lastCheckedBySource`: vouches for a source the ledger has not recorded yet. */
  checkTimes: Readonly<Record<string, string>>;
  monitoring: SourceMonitoringState;
  sourceResults: readonly SourceRunResult[];
  now: Date;
}

const TIERS: readonly Tier[] = ['A', 'B', 'C'];

export function sourceStanding(
  source: WatchSource,
  health: SourceHealthRecord | undefined,
  lastCheckedAt: string | undefined,
  monitoring: SourceMonitoringState,
  now: Date,
): SourceStanding {
  if (source.automation !== 'automatic') {
    const review = monitoring.manualReviews.find((entry) => entry.sourceId === source.id);
    return {
      kind: 'manual',
      because: source.automation.because,
      decision: source.automation.decision,
      lastReviewedAt: review?.reviewedAt ?? null,
      overdue: !review || !reviewIsCurrent(source, review, now),
    };
  }
  if (health && health.consecutiveFailures > 0 && health.firstFailureAt) {
    const cls = health.lastFailureClass ?? 'other';
    const failure = { since: health.firstFailureAt, runs: health.consecutiveFailures };
    return cls === 'identity_refused' || cls === 'robots_disallowed'
      ? { kind: 'refusal_undecided', ...failure, cls }
      : { kind: 'failing', ...failure, cls };
  }
  const lastSuccessAt = health?.lastSuccessAt ?? lastCheckedAt;
  return lastSuccessAt ? { kind: 'ok', lastSuccessAt } : { kind: 'not_yet_run' };
}

function bodyCoverage(standings: readonly SourceStanding[]): BodyCoverage {
  if (standings.some((standing) => standing.kind === 'ok')) return 'automatic';
  if (standings.some((standing) => standing.kind === 'manual')) return 'manual';
  if (standings.length === 0) return 'uncovered';
  return standings.every((standing) => standing.kind === 'not_yet_run') ? 'pending' : 'failing';
}

/**
 * Which publishing bodies the collector watches, per jurisdiction and tier.
 * A body counts as covered automatically when any of its automatic sources
 * is being reached, and by hand when it has an enabled manual source.
 * Out-of-scope bodies are left out; unassessed ones count as in scope.
 */
export function watchCoverage(input: WatchCoverageInput): WatchCoverageReport {
  const enabled = input.sources.filter((source) => source.enabled);
  const standingOf = new Map(
    enabled.map((source) => [
      source.id,
      sourceStanding(
        source,
        input.sourceHealth[source.id],
        input.checkTimes[source.id],
        input.monitoring,
        input.now,
      ),
    ]),
  );
  const inScope = input.bodies.filter((body) => body.scope.status !== 'out_of_scope');
  const coverageOf = new Map(
    inScope.map((body) => [
      body.id,
      bodyCoverage(
        enabled
          .filter((source) => source.bodyId === body.id)
          .map((source) => standingOf.get(source.id)!),
      ),
    ]),
  );

  const cells = JURISDICTIONS.flatMap((jurisdiction) =>
    TIERS.map((tier): WatchCoverageCell => {
      const cell = { jurisdiction, tier, bodies: 0, automatic: 0, manual: 0, failing: 0, pending: 0, uncovered: 0 };
      for (const body of inScope) {
        if (body.jurisdiction !== jurisdiction || body.tier !== tier) continue;
        cell.bodies++;
        cell[coverageOf.get(body.id)!]++;
      }
      return cell;
    }),
  ).filter((cell) => cell.bodies > 0);

  const gaps = inScope
    .flatMap((body) => {
      const coverage = coverageOf.get(body.id)!;
      return coverage === 'failing' || coverage === 'pending' || coverage === 'uncovered'
        ? [{ bodyId: body.id, name: body.name, jurisdiction: body.jurisdiction, tier: body.tier, coverage }]
        : [];
    })
    .sort(
      (a, b) =>
        a.tier.localeCompare(b.tier) ||
        JURISDICTIONS.indexOf(a.jurisdiction) - JURISDICTIONS.indexOf(b.jurisdiction) ||
        a.bodyId.localeCompare(b.bodyId),
    );

  const blocks = enabled.flatMap((source) => {
    const standing = standingOf.get(source.id)!;
    return source.automation !== 'automatic' && standing.kind === 'manual'
      ? [
          {
            sourceId: source.id,
            bodyId: source.bodyId,
            automation: source.automation,
            lastReviewedAt: standing.lastReviewedAt,
            overdue: standing.overdue,
          },
        ]
      : [];
  });

  const undecidedRefusals = enabled
    .flatMap((source) => {
      const standing = standingOf.get(source.id)!;
      return standing.kind === 'refusal_undecided'
        ? [{ sourceId: source.id, since: standing.since, runs: standing.runs, cls: standing.cls }]
        : [];
    })
    .sort((a, b) => a.since.localeCompare(b.since));

  const skippedLinked = input.sourceResults.flatMap((row) =>
    (row.skippedLinked ?? []).map((entry) => ({ sourceId: row.sourceId, ...entry })),
  );

  return {
    asOf: input.now.toISOString(),
    cells,
    gaps,
    blocks,
    undecidedRefusals,
    skippedLinked,
    unassessed: inScope.filter((body) => body.scope.status === 'unassessed').length,
  };
}
