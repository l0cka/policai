import type { Metadata } from 'next';
import { TimelineBrowser } from '@/components/timeline-browser';
import { getPolicies, getTimelineEvents } from '@/lib/data-service';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Australian AI Policy Timeline — Policai',
  description:
    'A source-backed timeline of Australian artificial intelligence policy, governance, and court developments.',
};

export default async function TimelinePage() {
  const [timelineData, policiesData] = await Promise.all([
    getTimelineEvents(),
    getPolicies(),
  ]);

  return (
    <TimelineBrowser
      timelineData={timelineData}
      policiesData={policiesData}
    />
  );
}
