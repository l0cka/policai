import {
  getPrimaryPolicyDate,
  getJurisdictionName,
  getPolicyTypeName,
  type DatePrecision,
  type Jurisdiction,
  type Policy,
  type PolicyDateType,
  type PolicyStatus,
  type PolicyType,
} from '@/types';

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

export interface NetworkTheme {
  key: string;
  label: string;
  policyCount: number;
}

export interface NetworkSummary {
  policyCount: number;
  thematicallyConnectedCount: number;
  isolatedCount: number;
  crossJurisdictionLinkCount: number;
  formalRelationshipCount: number;
  leadPolicyId: string | null;
  insight: string;
  themes: NetworkTheme[];
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

const NON_THEMATIC_TAGS = new Set([
  'act',
  'ai',
  'artificial intelligence',
  'commonwealth',
  'federal',
  'framework',
  'guideline',
  'guidelines',
  'northern territory',
  'nsw',
  'policy',
  'practice note',
  'queensland',
  'regulation',
  'south australia',
  'strategy',
  'tasmania',
  'victoria',
  'wa',
  'western australia',
]);

const LEAD_POLICY_ID = 'federal-court-gpn-ai';

export function normalizeNetworkTheme(value: string): string {
  return value.trim().toLocaleLowerCase('en-AU');
}

function isMeaningfulTheme(value: string): boolean {
  return !NON_THEMATIC_TAGS.has(normalizeNetworkTheme(value));
}

function getSharedTags(a: NetworkNode, b: NetworkNode): string[] {
  const bTags = new Set(b.tags.map(normalizeNetworkTheme));
  return a.tags.filter((tag) => bTags.has(normalizeNetworkTheme(tag)));
}

function uniqueThemes(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeNetworkTheme(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function buildThemes(nodes: NetworkNode[]): NetworkTheme[] {
  const themes = new Map<
    string,
    { label: string; policies: Set<string> }
  >();

  for (const node of nodes) {
    for (const tag of node.tags) {
      if (!isMeaningfulTheme(tag)) continue;
      const key = normalizeNetworkTheme(tag);
      const current = themes.get(key) ?? {
        label: tag,
        policies: new Set<string>(),
      };
      current.policies.add(node.id);
      themes.set(key, current);
    }
  }

  return [...themes.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      policyCount: value.policies.size,
    }))
    .filter((theme) => theme.policyCount >= 2)
    .sort(
      (a, b) =>
        b.policyCount - a.policyCount ||
        a.label.localeCompare(b.label, 'en-AU'),
    );
}

function buildInsight(edges: NetworkEdge[]): string {
  const crossThemeCounts = new Map<string, { label: string; count: number }>();

  for (const edge of edges) {
    if (edge.kind !== 'thematic' || !edge.crossJurisdiction) continue;
    for (const theme of edge.sharedThemes) {
      const key = normalizeNetworkTheme(theme);
      const current = crossThemeCounts.get(key) ?? { label: theme, count: 0 };
      current.count += 1;
      crossThemeCounts.set(key, current);
    }
  }

  const ranked = [...crossThemeCounts.entries()].sort(
    ([aKey, a], [bKey, b]) =>
      b.count - a.count ||
      Number(bKey === 'courts') - Number(aKey === 'courts') ||
      a.label.localeCompare(b.label, 'en-AU'),
  );

  if (ranked[0]?.[0] === 'courts') {
    return 'Court guidance forms the clearest cross-jurisdiction cluster.';
  }

  if (ranked[0]) {
    return `${ranked[0][1].label} forms the clearest cross-jurisdiction cluster.`;
  }

  return 'Explore shared policy themes across Australian jurisdictions.';
}

export function buildNetworkData(policies: Policy[]): {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  summary: NetworkSummary;
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
      const sharedTags = getSharedTags(a, b);
      const crossJurisdiction = a.jurisdiction !== b.jurisdiction;
      const threshold = crossJurisdiction ? 3 : 2;

      if (sharedTags.length >= threshold) {
        edges.push({
          source: a.id,
          target: b.id,
          kind: 'thematic',
          weight: sharedTags.length,
          sharedThemes: uniqueThemes(
            sharedTags.filter(isMeaningfulTheme),
          ),
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
  const thematicallyConnected = new Set<string>();

  for (const edge of edges) {
    const targetMap =
      edge.kind === 'formal' ? formalDegrees : thematicDegrees;
    targetMap.set(edge.source, (targetMap.get(edge.source) ?? 0) + 1);
    targetMap.set(edge.target, (targetMap.get(edge.target) ?? 0) + 1);
    if (edge.kind === 'thematic') {
      thematicallyConnected.add(edge.source);
      thematicallyConnected.add(edge.target);
    }
  }

  const nodes = baseNodes.map((node) => ({
    ...node,
    thematicDegree: thematicDegrees.get(node.id) ?? 0,
    formalDegree: formalDegrees.get(node.id) ?? 0,
  }));

  const leadPolicyId = nodeIds.has(LEAD_POLICY_ID)
    ? LEAD_POLICY_ID
    : [...nodes]
        .sort(
          (a, b) =>
            b.thematicDegree - a.thematicDegree ||
            a.title.localeCompare(b.title, 'en-AU'),
        )[0]?.id ?? null;

  const summary: NetworkSummary = {
    policyCount: nodes.length,
    thematicallyConnectedCount: thematicallyConnected.size,
    isolatedCount: nodes.length - thematicallyConnected.size,
    crossJurisdictionLinkCount: edges.filter(
      (edge) => edge.kind === 'thematic' && edge.crossJurisdiction,
    ).length,
    formalRelationshipCount: edges.filter((edge) => edge.kind === 'formal')
      .length,
    leadPolicyId,
    insight: buildInsight(edges),
    themes: buildThemes(nodes),
  };

  return { nodes, edges, summary };
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
    current.sharedThemes = uniqueThemes([
      ...current.sharedThemes,
      ...edge.sharedThemes,
    ]);

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

export function nodeMatchesTheme(
  node: NetworkNode,
  themeKey: string | null,
): boolean {
  if (!themeKey) return true;
  return node.tags.some(
    (tag) => normalizeNetworkTheme(tag) === normalizeNetworkTheme(themeKey),
  );
}

export function describeNetworkNode(node: NetworkNode): string {
  const relationships = node.thematicDegree + node.formalDegree;
  const relationshipLabel =
    relationships === 1 ? 'relationship' : 'relationships';
  return `${node.title}, ${getJurisdictionName(node.jurisdiction)}, ${getPolicyTypeName(node.type)}, ${relationships} ${relationshipLabel}`;
}
