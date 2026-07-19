import { NextResponse } from 'next/server';
import { getPolicyFrameworkArtifact } from '@/lib/data-service';

export const dynamic = 'force-static';
export const revalidate = 3600;

export async function GET() {
  const artifact = await getPolicyFrameworkArtifact();
  if (!artifact) {
    return NextResponse.json(
      { error: 'Framework artifact is awaiting policy re-verification' },
      { status: 404 },
    );
  }
  return NextResponse.json(artifact);
}
