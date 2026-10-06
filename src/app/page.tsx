import { PolicyBrowser } from '@/components/policy-browser';
import { UpcomingDeadlinesRail } from '@/components/upcoming-deadlines-rail';
import {
  getCollectionMeta,
  getDevelopments,
  getPolicies,
  getSourceMonitoring,
} from '@/lib/data-service';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import {
  selectUpcomingPolicyDates,
  splitUpcomingDeadlines,
  weekWindowEndingAt,
} from '@/lib/this-week';
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
  // Anchored to the data's own currency rather than the wall clock, so the
  // figure is deterministic for a given collection state (and satisfies the
  // render-purity rule).
  const dataCurrentAt = meta.lastHealthyAt ?? meta.lastCollectedAt;
  const weekAgo = dataCurrentAt
    ? new Date(dataCurrentAt).getTime() - 7 * 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  const weeklyDevelopmentCount = allDevelopments.filter(
    (development) =>
      development.status !== 'dismissed' &&
      new Date(development.detectedAt).getTime() >= weekAgo,
  ).length;

  // Coming up is measured from the Sydney calendar day of this render; the page
  // revalidates hourly, so a countdown is at most an hour behind. Deadlines get
  // their own rail; commencements stay in Coming up, so no date shows twice.
  const renderedAt = new Date();
  const today = renderedAt.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const { deadlines, other: upcomingDates } = splitUpcomingDeadlines(
    selectUpcomingPolicyDates(policies, weekWindowEndingAt(renderedAt)!),
  );

  return (
    <PolicyBrowser
      policies={policies}
      upcomingDates={upcomingDates}
      deadlinesRail={<UpcomingDeadlinesRail items={deadlines} today={today} />}
      today={today}
      developments={developments}
      developmentCount={allDevelopments.filter((development) => development.status !== 'dismissed').length}
      weeklyDevelopmentCount={weeklyDevelopmentCount}
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
