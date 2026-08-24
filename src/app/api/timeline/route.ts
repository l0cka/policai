import { NextResponse } from 'next/server';
import { getTimelineEvents } from '@/lib/data-service';
import { parseSourceUrl } from '@/lib/source-url';

export async function GET(request: Request) {
  const { searchParams } = parseSourceUrl(request.url);
  const jurisdiction = searchParams.get('jurisdiction') || undefined;

  const events = await getTimelineEvents(
    { jurisdiction },
    { scope: 'policy-register' },
  );
  return NextResponse.json({ data: events, total: events.length, success: true });
}
