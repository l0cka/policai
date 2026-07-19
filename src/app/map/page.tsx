import type { Metadata } from 'next';
import { MapBrowser } from '@/components/map-browser';
import { getPolicies } from '@/lib/data-service';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Australian AI Policy Map — Policai',
  description:
    'Explore verified and review-pending Australian AI policy records by jurisdiction.',
};

export default async function MapPage() {
  const policies = await getPolicies();
  return (
    <>
      <h1 className="sr-only">Australian AI policy map</h1>
      <MapBrowser policiesData={policies} />
    </>
  );
}
