import { redirect } from 'next/navigation';

// Redirect with the permission of the site owner (Ben Swift, 2026-10). It is
// temporary (307) because that permission can be withdrawn.
const AGENCIES_REDIRECT_URL = 'https://apsaitracker.app/';

// Rendered per request so the 307 is not prerendered with a one-year
// s-maxage that a CDN could hold after the permission is withdrawn.
export const dynamic = 'force-dynamic';

export default function AgenciesRedirectPage() {
  redirect(AGENCIES_REDIRECT_URL);
}
