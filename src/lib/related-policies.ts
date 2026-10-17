import type { Jurisdiction, Policy, PolicyType } from '@/types';
import {
  buildNetworkData,
  getNetworkConnections,
  type NetworkConnection,
} from '@/lib/network-data';

export const RELATED_VISIBLE_LIMIT = 8;

export type SupersessionRelation = 'Supersedes' | 'Superseded by';

export interface RelatedInstrument {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  type: PolicyType;
  sharedThemes: string[];
  relation?: SupersessionRelation;
}

function toInstrument(connection: NetworkConnection): RelatedInstrument {
  const { node, sharedThemes, formalLabel } = connection;
  return {
    id: node.id,
    title: node.title,
    jurisdiction: node.jurisdiction,
    type: node.type,
    sharedThemes,
    ...(formalLabel ? { relation: formalLabel as SupersessionRelation } : {}),
  };
}

export function relatedInstruments(
  policy: Policy,
  publicPolicies: Policy[],
): RelatedInstrument[] {
  const { nodes, edges } = buildNetworkData(publicPolicies);
  const connections = getNetworkConnections(policy.id, nodes, edges);
  const formal = connections.filter((connection) =>
    connection.kinds.includes('formal'),
  );
  const thematic = connections
    .filter((connection) => !connection.kinds.includes('formal'))
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        Number(b.node.jurisdiction === policy.jurisdiction) -
          Number(a.node.jurisdiction === policy.jurisdiction) ||
        b.node.effectiveDate.localeCompare(a.node.effectiveDate) ||
        a.node.title.localeCompare(b.node.title, 'en-AU'),
    );
  return [...formal, ...thematic].map(toInstrument);
}
