import { PolicyBrowser } from '@/components/policy-browser';
import {
  getCollectionMeta,
  getDevelopments,
  getPolicies,
  getSourceMonitoring,
} from '@/lib/data-service';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';

export const revalidate = 3600;

export default async function HomePage() {
  const [policies, allDevelopments, meta, monitoring] = await Promise.all([
    getPolicies(),
    getDevelopments(),
    getCollectionMeta(),
    getSourceMonitoring(),
  ]);
  const manualCoverage = summarizeManualSourceCoverage(
    WATCH_SOURCES,
    monitoring,
  );
  const developments = allDevelopments
    .filter(
      (development) =>
        development.status !== 'dismissed' &&
        development.verification.status === 'verified',
    )
    .slice(0, 6);

  return (
    <PolicyBrowser
      policies={policies}
      developments={developments}
      lastCollectedAt={meta.lastCollectedAt}
      lastHealthyAt={meta.lastHealthyAt}
      lastReviewedAt={meta.lastReviewedAt}
      collectionHealth={meta.collector.health}
      successfulSourceCount={meta.collector.successfulSourceCount}
      dueSourceCount={meta.collector.dueSourceCount}
      automaticSourceCount={meta.collector.automaticSourceCount}
      manualSourceCount={manualCoverage.total}
      currentManualSourceCount={manualCoverage.current}
      unavailableManualSourceCount={manualCoverage.unavailable}
    />
  );
}
