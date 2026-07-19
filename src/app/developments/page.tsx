import type { Metadata } from 'next';
import { DevelopmentsBrowser } from '@/components/developments-browser';
import {
  getCollectionMeta,
  getDevelopments,
  getSourceMonitoring,
} from '@/lib/data-service';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Developments — Policai',
  description: 'Verified and emerging Australian AI policy developments from official government sources.',
};

export default async function DevelopmentsPage() {
  const [developments, meta, monitoring] = await Promise.all([
    getDevelopments(),
    getCollectionMeta(),
    getSourceMonitoring(),
  ]);
  const manualCoverage = summarizeManualSourceCoverage(WATCH_SOURCES, monitoring);

  return (
    <DevelopmentsBrowser
      developments={developments.filter((development) => development.status !== 'dismissed')}
      collectionHealth={meta.collector.health}
      lastCollectedAt={meta.lastCollectedAt}
      successfulSourceCount={meta.collector.successfulSourceCount}
      dueSourceCount={meta.collector.dueSourceCount}
      automaticSourceCount={meta.collector.automaticSourceCount}
      manualSourceCount={manualCoverage.total}
      currentManualSourceCount={manualCoverage.current}
    />
  );
}
