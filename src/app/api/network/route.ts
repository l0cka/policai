import { NextResponse } from 'next/server';
import { getPolicies } from '@/lib/data-service';
import { buildNetworkData } from '@/lib/network-data';

export async function GET() {
  try {
    const policies = await getPolicies();
    const { nodes, edges } = buildNetworkData(policies);

    return NextResponse.json({ nodes, edges, success: true });
  } catch (error) {
    console.error('[network] Failed to compute graph:', error);
    return NextResponse.json(
      { error: 'Failed to load network data', success: false },
      { status: 500 },
    );
  }
}
