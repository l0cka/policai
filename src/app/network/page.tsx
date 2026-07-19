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
  return (
    <>
      <h1 className="sr-only">Australian AI policy network</h1>
      <NetworkBrowser nodes={nodes} edges={edges} />
    </>
  );
}
