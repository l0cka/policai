import { NextResponse } from 'next/server';
import { getDevelopments } from '@/lib/data-service';

export const dynamic = 'force-static';
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(await getDevelopments());
}
