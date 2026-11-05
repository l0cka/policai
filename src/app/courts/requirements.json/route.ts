import { NextResponse } from 'next/server';
import { getPublicCourtRequirements, toShownRequirement } from '@/lib/court-requirements';

export const revalidate = 3600;

/**
 * The requirement text the courts page does not ship in its HTML: it is only
 * read when a note opens or a search starts, so the browser fetches it then.
 */
export async function GET() {
  const requirements = await getPublicCourtRequirements();
  return NextResponse.json({ requirements: requirements.map(toShownRequirement) });
}
