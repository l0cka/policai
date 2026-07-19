import type { Metadata } from 'next';
import { NetworkBrowser } from '@/components/network-browser';
import { getPolicies } from '@/lib/data-service';
import { buildNetworkData } from '@/lib/network-data';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Australian AI Policy Network — Policai',
  description:
    'Explore source-backed relationships among Australian AI policy instruments.',
};

export default async function NetworkPage() {
  const policies = await getPolicies();
  const { nodes, edges } = buildNetworkData(policies);
  return <NetworkBrowser nodes={nodes} edges={edges} />;
}
