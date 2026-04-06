import { NextResponse } from 'next/server';
import { getTimelineEvents } from '@/lib/data-service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jurisdiction = searchParams.get('jurisdiction') || undefined;

  const events = await getTimelineEvents({ jurisdiction });
  return NextResponse.json({ data: events, total: events.length, success: true });
}
