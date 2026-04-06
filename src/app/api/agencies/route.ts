import { NextResponse } from 'next/server';
import { getAgencies, getCommonwealthAgencies } from '@/lib/data-service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level') || undefined;
  const jurisdiction = searchParams.get('jurisdiction') || undefined;
  const commonwealth = searchParams.get('commonwealth');

  if (commonwealth === 'true') {
    const agencies = await getCommonwealthAgencies();
    return NextResponse.json({ data: agencies, total: agencies.length, success: true });
  }

  const agencies = await getAgencies({ level, jurisdiction });
  return NextResponse.json({ data: agencies, total: agencies.length, success: true });
}
