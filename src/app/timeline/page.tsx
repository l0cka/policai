import type { Metadata } from 'next';
import { TimelineBrowser } from '@/components/timeline-browser';
import { getPolicies, getTimelineEvents } from '@/lib/data-service';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const TIMELINE_TITLE = 'Australian AI policy timeline';
const TIMELINE_DESCRIPTION =
  'A source-backed timeline of lifecycle events for policies in the Australian AI policy register.';

export const metadata: Metadata = {
  title: TIMELINE_TITLE,
  description: TIMELINE_DESCRIPTION,
  alternates: pageAlternates('/timeline'),
  ...pageSocialMeta({
    title: TIMELINE_TITLE,
    description: TIMELINE_DESCRIPTION,
    path: '/timeline',
  }),
};

export default async function TimelinePage() {
  const [timelineData, policiesData] = await Promise.all([
    getTimelineEvents(undefined, { scope: 'policy-register' }),
    getPolicies(),
  ]);

  return (
    <TimelineBrowser
      timelineData={timelineData}
      policiesData={policiesData}
    />
  );
}
