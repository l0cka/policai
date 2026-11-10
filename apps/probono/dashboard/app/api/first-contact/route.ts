import { NextResponse } from 'next/server';
import { lookup } from '../../../lib/first-contact-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const circumstances: Record<string, unknown> = {};
  for (const key of ['aboriginal_torres_strait_islander', 'family_violence', 'under_18']) {
    const v = p.get(key);
    if (v !== null) circumstances[key] = v === 'true' ? true : v === 'false' ? false : v;
  }
  const language = p.get('language');
  if (language) circumstances.language = language;
  const out = lookup({
    state: p.get('state') ?? undefined,
    postcode: p.get('postcode') ?? undefined,
    lga: p.get('lga') ?? undefined,
    problem: p.get('problem') ?? undefined,
    ...(Object.keys(circumstances).length ? { circumstances } : {}),
  });
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json(out.result, { headers: { 'Cache-Control': 'no-store' } });
}
