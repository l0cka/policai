import type { Metadata } from 'next';
import { DevelopmentsBrowser } from '@/components/developments-browser';
import {
  getCollectionMeta,
  getDevelopments,
  getSourceMonitoring,
} from '@/lib/data-service';
import { getDevelopmentStream } from '@/lib/development-streams';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const DEVELOPMENTS_TITLE = 'Australian AI policy developments';
const DEVELOPMENTS_DESCRIPTION =
  'New and emerging Australian AI policy activity detected on official government sources, for review against the curated Policai register.';

export const metadata: Metadata = {
  title: DEVELOPMENTS_TITLE,
  description: DEVELOPMENTS_DESCRIPTION,
  alternates: pageAlternates('/developments'),
  ...pageSocialMeta({
    title: DEVELOPMENTS_TITLE,
    description: DEVELOPMENTS_DESCRIPTION,
    path: '/developments',
  }),
};

export default async function DevelopmentsPage() {
  const [developments, meta, monitoring] = await Promise.all([
    getDevelopments(),
    getCollectionMeta(),
    getSourceMonitoring(),
  ]);
  const manualCoverage = summarizeManualSourceCoverage(WATCH_SOURCES, monitoring);
  const visible = developments.filter((development) => development.status !== 'dismissed');
  const streamById = Object.fromEntries(
    visible.map((development) => [
      development.id,
      getDevelopmentStream(development, WATCH_SOURCES),
    ]),
  );

  return (
    <DevelopmentsBrowser
      developments={visible}
      streamById={streamById}
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
