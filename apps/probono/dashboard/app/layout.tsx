import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from './nav';
import ThemeToggle, { themeInitScript } from './theme-toggle';
import CompanionMark from './companion-mark';
import { getPool } from '../lib/db';
import './globals.css';
import './editorial.css';
import { auDate } from '../lib/au-date';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, pageMetadata, siteJsonLd } from '../lib/site-meta';

export const dynamic = 'force-dynamic';


/*
 * The site answers on two hostnames: a2j.policai.org, and probono.policai.org
 * from before the rename. Both serve the same pages, so a canonical is what
 * stops the pair reading as duplicated content — and it names which of the two
 * is the address.
 *
 * The favicon is `app/favicon.ico`, picked up by the App Router's file
 * convention; it is Policai's own mark, copied byte-for-byte from the register.
 */
export const metadata: Metadata = {
  // pi-lens-ignore: unchecked-throwing-call
  metadataBase: new URL(SITE_URL),
  ...pageMetadata({ description: SITE_DESCRIPTION, path: '/' }),
  // Same separator as the Policai register: "Page - Policai A2J".
  title: { default: SITE_TITLE, template: `%s - ${SITE_NAME}` },
  // './' resolves against metadataBase *and* the current path, so every page
  // gets its own canonical rather than all four claiming the home page.
  alternates: { canonical: './' },
};

/**
 * The dateline reports when the collector last ran, in the manner of a
 * masthead's edition line. A database that is down should dim the line, not
 * take the page with it.
 */
async function lastIngestAt(): Promise<string | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT max(created_at) AS at FROM ingest_runs WHERE status = 'ok'`,
    );
    return rows[0]?.at ? new Date(rows[0].at).toISOString() : null;
  } catch {
    return null;
  }
}

function formatDataDate(value: string | null): string {
  if (!value) return 'COLLECTION STATUS UNAVAILABLE';
  return `DATA CURRENT TO ${auDate(new Date(value), {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    })
    .toUpperCase()}`;
}

const FOOTER_GROUPS: Array<{ label: string; links: Array<[string, string]> }> = [
  { label: 'Radar', links: [['/', 'Feed'], ['/this-week', 'This week'], ['/deadlines', 'Deadlines']] },
  { label: 'Reference', links: [['/sector', 'Sector'], ['/health', 'Source health']] },
  {
    label: 'About',
    links: [
      ['https://policai.org/methodology', 'Methodology'],
      ['https://github.com/l0cka/probono-radar', 'GitHub'],
      ['https://policai.org', 'Policai'],
    ],
  },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const dataCurrentAt = await lastIngestAt();
  const dataCurrent = formatDataDate(dataCurrentAt);

  return (
    <html
      lang="en-AU"
      suppressHydrationWarning
    >
      <head>
        {/*
          Static, developer-authored string with no interpolated input. It sets
          the stored theme before first paint so the page never flashes the
          system theme on the way to the chosen one.
        */}
        <script>{themeInitScript}</script>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
      </head>
      <body>
        <a href="#main-content" className="sr-only skip-link">
          Skip to content
        </a>

        <header className="site-header rule-masthead">
          <div className="container masthead">
            <Link href="/" aria-label="Policai A2J home" className="brand">
              <CompanionMark />
              <span className="brand-wordmark">policai<span className="brand-edition">A2J</span></span>
            </Link>
            <Nav />
            <Link
              href="/health"
              className="header-status"
              title={dataCurrent}
              aria-label={`Source health: ${dataCurrent.toLowerCase()}`}
            >
              <i aria-hidden="true" />
              <span>Live</span>
            </Link>
          </div>
        </header>

        <main id="main-content">{children}</main>

        <footer className="site-footer">
          <div className="container footer-grid">
            <div className="footer-about">
              <p>
                A standing watch on Australian pro bono and access to justice. Every item links to the
                source it was collected from, and the collector&rsquo;s run history is public.
              </p>
              <p className="footer-current">{dataCurrent}</p>
              <ThemeToggle />
            </div>
            <nav aria-label="Footer" className="footer-groups">
              {FOOTER_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="page-eyebrow">{group.label}</p>
                  {group.links.map(([href, label]) =>
                    href.startsWith('http') ? (
                      <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="underline-grow">
                        {label}
                      </a>
                    ) : (
                      <Link key={href} href={href} className="underline-grow">
                        {label}
                      </Link>
                    ),
                  )}
                </div>
              ))}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
