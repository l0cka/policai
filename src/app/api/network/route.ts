import { NextResponse } from 'next/server';
import { getPolicies } from '@/lib/data-service';

export interface NetworkNode {
  id: string;
  title: string;
  jurisdiction: string;
  status: string;
  type: string;
  tags: string[];
  agencies: string[];
  effectiveDate: string;
  sourceUrl: string;
  description: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  crossJurisdiction: boolean;
}

export async function GET() {
  try {
    const policies = await getPolicies();

    // Build nodes
    const nodes: NetworkNode[] = policies
      .filter((p) => p.status !== 'trashed')
      .map((p) => ({
        id: p.id,
        title: p.title,
        jurisdiction: p.jurisdiction,
        status: p.status,
        type: p.type,
        tags: p.tags,
        agencies: p.agencies,
        effectiveDate: typeof p.effectiveDate === 'string' ? p.effectiveDate : '',
        sourceUrl: p.sourceUrl,
        description: p.description,
      }));

    // Build edges from shared tags
    const edges: NetworkEdge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const sharedTags = a.tags.filter((t) => b.tags.includes(t));
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

    return NextResponse.json({ nodes, edges, success: true });
  } catch (error) {
    console.error('[network] Failed to compute graph:', error);
    return NextResponse.json(
      { error: 'Failed to load network data', success: false },
      { status: 500 },
    );
  }
}
