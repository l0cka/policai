import { NextResponse, type NextRequest } from 'next/server';

/*
 * The site was launched at probono.policai.org and renamed to a2j.policai.org.
 * Both hostnames still route through the tunnel to this app; this sends the old
 * one on to the new one permanently, so links and bookmarks made before the
 * rename keep working and search engines transfer what they know to the new
 * address rather than indexing two copies of it.
 *
 * 301 rather than Next's own `redirects()`, which issues a 308. The two are
 * equivalent to a search engine, but 301 is what the oldest clients understand
 * and nothing here posts a form, which is the only thing 308 protects.
 *
 * Done in the app rather than at the Cloudflare edge because the API token on
 * the server is scoped to DNS edits alone. An edge rule would be marginally
 * faster and would survive the app being down; if that token ever gains
 * `Dynamic Redirect` permission, this file is the thing to delete.
 */
const OLD_HOST = 'probono.policai.org';
const NEW_HOST = 'a2j.policai.org';

export function middleware(request: NextRequest) {
  // Behind the tunnel the request URL's host is the internal one, so the
  // client's actual hostname has to come from the header.
  const host = request.headers.get('host')?.split(':')[0].toLowerCase();
  if (host !== OLD_HOST) return NextResponse.next();

  // pi-lens-ignore: unchecked-throwing-call
  const target = URL.parse(request.url);
  if (!target) return NextResponse.next();
  target.protocol = 'https:';
  target.hostname = NEW_HOST;
  /*
   * Cleared explicitly. The URL is the internal one the container was reached
   * on, so it carries port 3000, and neither the `hostname` nor the `host`
   * setter drops a port that is already there — the redirect would otherwise
   * point the browser at https://a2j.policai.org:3000/.
   */
  target.port = '';
  // Path and query are carried across: a redirect that drops them sends
  // someone who followed a link to a deadline to the home page instead.
  return NextResponse.redirect(target, 301);
}

export const config = {
  /*
   * Everything except Next's own build output. The redirect has to cover real
   * pages, not the asset requests that follow them — an asset fetched from the
   * old host is already being fetched by a page that has been redirected.
   */
  matcher: ['/((?!_next/static|_next/image).*)'],
};
