import { NextResponse } from 'next/server';
import { getPolicies } from '@/lib/data-service';
import { checkRateLimit } from '@/lib/rate-limit';

// Read-only public API. Policies are published by committing to the repo
// (via the local MCP source-ingest server or the collector), not over HTTP.
export async function GET(request: Request) {
  const limited = checkRateLimit(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const jurisdiction = searchParams.get('jurisdiction') || undefined;
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;

  if (status === 'trashed') {
    return NextResponse.json(
      { error: 'Not found', success: false },
      { status: 404 }
    );
  }

  const filteredPolicies = await getPolicies({
    jurisdiction,
    type,
    status,
    search,
  });

  return NextResponse.json({
    data: filteredPolicies,
    total: filteredPolicies.length,
    success: true,
  });
}
