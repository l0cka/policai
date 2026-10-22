import type { Metadata } from 'next';
import { AnalysisHero } from '@/components/analysis-hero';
import { PolicyBrowser } from '@/components/policy-browser';
import { UpcomingDeadlinesRail } from '@/components/upcoming-deadlines-rail';
import { getArticles, getPolicies } from '@/lib/data-service';
import {
  selectUpcomingPolicyDates,
  splitUpcomingDeadlines,
  weekWindowEndingAt,
} from '@/lib/this-week';
import {
  pageAlternates,
  pageSocialMeta,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from '@/lib/site-seo';

export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: pageAlternates('/'),
  ...pageSocialMeta({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    path: '/',
  }),
};

export default async function HomePage() {
  const [policies, articles] = await Promise.all([getPolicies(), getArticles()]);

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
      analysisHero={<AnalysisHero articles={articles} />}
      deadlinesRail={<UpcomingDeadlinesRail items={deadlines} today={today} />}
      today={today}
    />
  );
}
