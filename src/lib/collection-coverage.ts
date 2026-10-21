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

function errorNamesManualSource(error: string, manualIds: ReadonlySet<string>): boolean {
  for (const sourceId of manualIds) {
    if (error.startsWith(`${sourceId}:`)) return true;
  }
  return false;
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
  const health = collectionRunHealth(
    sourceResults,
    catalog,
    minHealthySourceRate,
  );
  return {
    ...meta,
    lastHealthyAt:
      health.status === 'healthy' && meta.lastCollectedAt
        ? meta.lastCollectedAt
        : meta.lastHealthyAt,
    collector: {
      ...collector,
      lastRunSources: collector.lastRunSources.filter(
        (sourceId) => !isManualSourceId(manualIds, sourceId),
      ),
      lastRunErrors: collector.lastRunErrors.filter(
        (error) => !errorNamesManualSource(error, manualIds),
      ),
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
