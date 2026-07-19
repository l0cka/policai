import {
  getPrimaryPolicyDate,
  type DatePrecision,
  type Policy,
  type PolicyDateType,
} from '@/types';

export interface NetworkNode {
  id: string;
  title: string;
  jurisdiction: string;
  status: string;
  type: string;
  tags: string[];
  agencies: string[];
  effectiveDate: string;
  dateType: PolicyDateType;
  datePrecision: DatePrecision;
  sourceUrl: string;
  description: string;
  verificationStatus: Policy['verification']['status'];
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  crossJurisdiction: boolean;
}

export function buildNetworkData(policies: Policy[]): {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
} {
  const nodes: NetworkNode[] = policies
    .filter((policy) => policy.status !== 'trashed')
    .map((policy) => {
      const primaryDate = getPrimaryPolicyDate(policy);
      return {
        id: policy.id,
        title: policy.title,
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
      };
    });

  const edges: NetworkEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const sharedTags = a.tags.filter((tag) => b.tags.includes(tag));
      const crossJurisdiction = a.jurisdiction !== b.jurisdiction;
      const threshold = crossJurisdiction ? 3 : 2;

      if (sharedTags.length >= threshold) {
        edges.push({
          source: a.id,
          target: b.id,
          weight: sharedTags.length,
          crossJurisdiction,
        });
      }
    }
  }

  return { nodes, edges };
}
