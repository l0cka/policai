import {
  getPrimaryPolicyDate,
  type DatePrecision,
  type Jurisdiction,
  type Policy,
  type PolicyDateType,
  type PolicyStatus,
  type PolicyType,
} from '@/types';
import { getThemeLabel, type ThemeId } from '@/lib/themes';

export type NetworkEdgeKind = 'thematic' | 'formal';
export type FormalRelationship = 'superseded_by';

export interface NetworkNode {
  id: string;
  title: string;
  shortLabel: string;
  jurisdiction: Jurisdiction;
  status: PolicyStatus;
  type: PolicyType;
  tags: string[];
  themes: ThemeId[];
  agencies: string[];
  effectiveDate: string;
  dateType: PolicyDateType;
  datePrecision: DatePrecision;
  sourceUrl: string;
  description: string;
  verificationStatus: Policy['verification']['status'];
  supersededBy?: string;
  thematicDegree: number;
  formalDegree: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  kind: NetworkEdgeKind;
  weight: number;
  sharedThemes: string[];
  crossJurisdiction: boolean;
  formalRelationship?: FormalRelationship;
}

export interface NetworkConnection {
  node: NetworkNode;
  kinds: NetworkEdgeKind[];
  sharedThemes: string[];
  weight: number;
  crossJurisdiction: boolean;
  formalLabel?: string;
}

const NETWORK_LABEL_OVERRIDES: Record<string, string> = {
  'federal-court-gpn-ai': 'Federal Court GPN-AI',
  'nsw-supreme-court-sc-gen-23': 'NSW SC Gen 23',
  'vic-supreme-court-ai-guidelines': 'Vic Supreme Court guidance',
  'vic-supreme-court-sc-gen-25': 'Vic Supreme Court SC GEN 25',
  'family-court-ai-practice-direction': 'FCFCOA PD-AI',
  'qld-supreme-court-ai-practice-direction': 'QLD Practice Direction 5',
};

function getSharedThemes(a: NetworkNode, b: NetworkNode): ThemeId[] {
  return a.themes.filter((theme) => b.themes.includes(theme));
}

function getShortLabel(policy: Policy): string {
  const override = NETWORK_LABEL_OVERRIDES[policy.id];
  if (override) return override;

  const emDashLead = policy.title.split(/\s+[—–]\s+/u)[0]?.trim();
  const candidate =
    emDashLead && emDashLead.length >= 4 ? emDashLead : policy.title;

  if (candidate.length <= 34) return candidate;
  return `${candidate.slice(0, 31).trimEnd()}…`;
}

export function buildNetworkData(policies: Policy[]): {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
} {
  const baseNodes: NetworkNode[] = policies
    .filter((policy) => policy.status !== 'trashed')
    .map((policy) => {
      const primaryDate = getPrimaryPolicyDate(policy);
      return {
        id: policy.id,
        title: policy.title,
        shortLabel: getShortLabel(policy),
        jurisdiction: policy.jurisdiction,
        status: policy.status,
        type: policy.type,
        tags: policy.tags,
        themes: policy.themes,
        agencies: policy.agencies,
        effectiveDate:
          typeof primaryDate.date === 'string'
            ? primaryDate.date
            : primaryDate.date.toISOString().slice(0, 10),
        dateType: primaryDate.type,
        datePrecision: primaryDate.precision,
        sourceUrl: policy.sourceUrl,
        description: policy.description,
        verificationStatus: policy.verification.status,
        supersededBy: policy.supersededBy,
        thematicDegree: 0,
        formalDegree: 0,
      };
    });

  const edges: NetworkEdge[] = [];
  for (let i = 0; i < baseNodes.length; i++) {
    for (let j = i + 1; j < baseNodes.length; j++) {
      const a = baseNodes[i];
      const b = baseNodes[j];
      const sharedThemes = getSharedThemes(a, b);
      const crossJurisdiction = a.jurisdiction !== b.jurisdiction;
      const threshold = crossJurisdiction ? 3 : 2;

      if (sharedThemes.length >= threshold) {
        edges.push({
          source: a.id,
          target: b.id,
          kind: 'thematic',
          weight: sharedThemes.length,
          sharedThemes: sharedThemes.map(getThemeLabel),
          crossJurisdiction,
        });
      }
    }
  }

  const nodeIds = new Set(baseNodes.map((node) => node.id));
  for (const node of baseNodes) {
    if (!node.supersededBy || !nodeIds.has(node.supersededBy)) continue;
    const target = baseNodes.find((candidate) => candidate.id === node.supersededBy);
    edges.push({
      source: node.id,
      target: node.supersededBy,
      kind: 'formal',
      weight: 1,
      sharedThemes: [],
      crossJurisdiction:
        target !== undefined && target.jurisdiction !== node.jurisdiction,
      formalRelationship: 'superseded_by',
    });
  }

  const thematicDegrees = new Map<string, number>();
  const formalDegrees = new Map<string, number>();

  for (const edge of edges) {
    const targetMap =
      edge.kind === 'formal' ? formalDegrees : thematicDegrees;
    targetMap.set(edge.source, (targetMap.get(edge.source) ?? 0) + 1);
    targetMap.set(edge.target, (targetMap.get(edge.target) ?? 0) + 1);
  }

  const nodes = baseNodes.map((node) => ({
    ...node,
    thematicDegree: thematicDegrees.get(node.id) ?? 0,
    formalDegree: formalDegrees.get(node.id) ?? 0,
  }));

  return { nodes, edges };
}

export function getNetworkConnections(
  nodeId: string,
  nodes: NetworkNode[],
  edges: NetworkEdge[],
): NetworkConnection[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connections = new Map<string, NetworkConnection>();

  for (const edge of edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;

    const connectedId = edge.source === nodeId ? edge.target : edge.source;
    const connectedNode = nodeMap.get(connectedId);
    if (!connectedNode) continue;

    const current = connections.get(connectedId) ?? {
      node: connectedNode,
      kinds: [],
      sharedThemes: [],
      weight: 0,
      crossJurisdiction: edge.crossJurisdiction,
    };

    if (!current.kinds.includes(edge.kind)) current.kinds.push(edge.kind);
    current.weight = Math.max(current.weight, edge.weight);
    current.crossJurisdiction ||= edge.crossJurisdiction;
    current.sharedThemes = [
      ...new Set([...current.sharedThemes, ...edge.sharedThemes]),
    ];

    if (edge.formalRelationship === 'superseded_by') {
      current.formalLabel =
        edge.source === nodeId ? 'Superseded by' : 'Supersedes';
    }

    connections.set(connectedId, current);
  }

  return [...connections.values()].sort(
    (a, b) =>
      Number(b.kinds.includes('formal')) -
        Number(a.kinds.includes('formal')) ||
      b.weight - a.weight ||
      a.node.title.localeCompare(b.node.title, 'en-AU'),
  );
}
