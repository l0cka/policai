import type { Metadata } from 'next';
import { NetworkBrowser } from '@/components/network-browser';
import { getPolicies } from '@/lib/data-service';
import { buildNetworkData } from '@/lib/network-data';
import { parseNetworkViewState } from '@/lib/network-view-state';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Australian AI Policy Network — Policai',
  description:
    'Explore source-backed relationships among Australian AI policy instruments.',
};

function toUrlSearchParams(
  value: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) {
      for (const item of entry) params.append(key, item);
    } else if (entry !== undefined) {
      params.set(key, entry);
    }
  }
  return params;
}

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const policies = await getPolicies();
  const { nodes, edges, summary } = buildNetworkData(policies);
  const initialViewState = parseNetworkViewState(
    toUrlSearchParams(await searchParams),
    {
      defaultFocus: summary.leadPolicyId,
      validNodeIds: nodes.map((node) => node.id),
      validThemeKeys: summary.themes.map((theme) => theme.key),
    },
  );
  return (
    <NetworkBrowser
      nodes={nodes}
      edges={edges}
      summary={summary}
      initialViewState={initialViewState}
    />
  );
}
