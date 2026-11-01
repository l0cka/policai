import type { CollectionHealthStatus, CollectionMeta, SourceRunResult } from '@/types';
import type { SourceAutomation } from '@/lib/pipeline/sources';

/**
 * A run below this successful-source ratio is failed, not fresh.
 * `collect` uses the same default.
 */
export const MIN_HEALTHY_SOURCE_RATE = 0.8;

export interface CoverageCatalogSource {
  id: string;
  enabled: boolean;
  automation: SourceAutomation;
  critical?: boolean;
}

/**
 * Coverage arithmetic for one collection run. Rows with `coverageEligible:
 * false` are candidate-only retries: they stay out of the due-source ratio,
 * and an error on one of them still marks the run degraded.
 */
export function collectionRunHealth(
  sourceResults: SourceRunResult[],
  sources: readonly Pick<CoverageCatalogSource, 'id' | 'critical'>[],
  minHealthySourceRate: number,
): {
  status: CollectionHealthStatus;
  dueSourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  skippedSourceCount: number;
  successRate: number;
} {
  const coverageResults = sourceResults.filter(
    (result) => result.coverageEligible !== false,
  );
  const successfulSourceCount = coverageResults.filter(
    (result) => result.status === 'success',
  ).length;
  const failedSourceCount = coverageResults.filter(
    (result) => result.status === 'error',
  ).length;
  const skippedSourceCount = sourceResults.filter(
    (result) => result.status === 'skipped',
  ).length;
  const dueSourceCount = successfulSourceCount + failedSourceCount;
  const successRate =
    dueSourceCount === 0 ? 1 : successfulSourceCount / dueSourceCount;
  const criticalSourceIds = new Set(
    sources.filter((source) => source.critical).map((source) => source.id),
  );
  const criticalFailure = coverageResults.some(
    (result) =>
      result.status === 'error' && criticalSourceIds.has(result.sourceId),
  );
  const retryFailure = sourceResults.some(
    (result) =>
      result.coverageEligible === false && result.status === 'error',
  );

  let status: CollectionHealthStatus = 'healthy';
  if (criticalFailure || successRate < minHealthySourceRate) {
    status = 'failed';
  } else if (failedSourceCount > 0 || retryFailure) {
    status = 'degraded';
  }

  return {
    status,
    dueSourceCount,
    successfulSourceCount,
    failedSourceCount,
    skippedSourceCount,
    successRate,
  };
}

function isManualSourceId(manualIds: ReadonlySet<string>, sourceId: string): boolean {
  return manualIds.has(sourceId);
}

/** Marks a run-level note that a source went unchecked past its limit. */
export const UNCHECKED_SOURCE_MARKER = ': unchecked (';

/**
 * A retrieval failure of a manual source. A note that a manual source went
 * unchecked is not one: the public meta must keep it.
 */
function errorNamesManualSource(error: string, manualIds: ReadonlySet<string>): boolean {
  for (const sourceId of manualIds) {
    if (error.startsWith(`${sourceId}${UNCHECKED_SOURCE_MARKER}`)) return false;
    if (error.startsWith(`${sourceId}:`)) return true;
  }
  return false;
}

/**
 * Adds run-level errors that no source result carries (legislation follows,
 * unchecked sources). A healthy run with any of them is degraded, so it
 * keeps the previous `lastHealthyAt`.
 */
export function withRunLevelErrors(
  meta: CollectionMeta,
  errors: readonly string[],
  previousLastHealthyAt: string | null,
): CollectionMeta {
  if (errors.length === 0) return meta;
  const degraded = meta.collector.health === 'healthy';
  return {
    ...meta,
    lastHealthyAt: degraded ? previousLastHealthyAt : meta.lastHealthyAt,
    collector: {
      ...meta.collector,
      lastRunErrors: [...meta.collector.lastRunErrors, ...errors],
      health: degraded ? 'degraded' : meta.collector.health,
    },
  };
}

/**
 * Public automatic coverage ignores sources the catalogue tracks by hand.
 * A result recorded while a source was still automatic — `accc-rss` and
 * `wa-ai-policy` in the October 2026 runs — must not stay in the due-source
 * count or keep the run degraded after the source moves to manual
 * tracking.
 */
export function publicAutomaticCollectionMeta(
  meta: CollectionMeta,
  catalog: readonly CoverageCatalogSource[],
  minHealthySourceRate = MIN_HEALTHY_SOURCE_RATE,
): CollectionMeta {
  const manualIds = new Set(
    catalog
      .filter((source) => source.automation !== 'automatic')
      .map((source) => source.id),
  );
  if (manualIds.size === 0) return meta;
  const collector = meta.collector;
  const recorded =
    collector.sourceResults.some((result) =>
      isManualSourceId(manualIds, result.sourceId),
    ) ||
    collector.lastRunSources.some((sourceId) =>
      isManualSourceId(manualIds, sourceId),
    ) ||
    collector.lastRunErrors.some((error) =>
      errorNamesManualSource(error, manualIds),
    );
  if (!recorded) return meta;

  const sourceResults = collector.sourceResults.filter(
    (result) => !isManualSourceId(manualIds, result.sourceId),
  );
  const lastRunErrors = collector.lastRunErrors.filter(
    (error) => !errorNamesManualSource(error, manualIds),
  );
  const health = collectionRunHealth(
    sourceResults,
    catalog,
    minHealthySourceRate,
  );
  if (health.status === 'healthy' && lastRunErrors.length > 0) {
    health.status = 'degraded';
  }
  return {
    ...meta,
    lastHealthyAt:
      health.status === 'healthy' && meta.lastCollectedAt
        ? meta.lastCollectedAt
        : meta.lastHealthyAt,
    lastUsableAt:
      health.status !== 'failed' && meta.lastCollectedAt
        ? meta.lastCollectedAt
        : meta.lastUsableAt,
    collector: {
      ...collector,
      lastRunSources: collector.lastRunSources.filter(
        (sourceId) => !isManualSourceId(manualIds, sourceId),
      ),
      lastRunErrors,
      health: health.status,
      dueSourceCount: health.dueSourceCount,
      successfulSourceCount: health.successfulSourceCount,
      failedSourceCount: health.failedSourceCount,
      skippedSourceCount: health.skippedSourceCount,
      successRate: Number(health.successRate.toFixed(3)),
      automaticSourceCount: catalog.filter(
        (source) => source.enabled && source.automation === 'automatic',
      ).length,
      manualSourceCount: catalog.filter(
        (source) => source.enabled && source.automation !== 'automatic',
      ).length,
      sourceResults,
    },
  };
}
