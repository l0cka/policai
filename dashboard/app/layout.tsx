import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import Nav from './nav';
import ThemeToggle, { themeInitScript } from './theme-toggle';
import { RadarMark } from './icons';
import { getPool } from '../lib/db';
import './globals.css';

export const dynamic = 'force-dynamic';

/*
 * One face for the whole site. The display, interface and metadata roles still
 * exist in the stylesheet as --font-display / --font-sans / --font-mono; they
 * simply all resolve here now, so the distinction survives if the site ever
 * takes a second face back.
 *
 * 600 and 700 are carried because headings and table keys ask for them, and a
 * weight the file does not contain gets synthesised into a smeared faux bold.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

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
  metadataBase: new URL('https://a2j.policai.org'),
  title: 'Policai A2J',
  description:
    'A monitor of Australian pro bono, access-to-justice and legal assistance news, law reform, funding and deadlines, each item linked to its source.',
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
  if (!value) return 'SOURCE STATUS ON THE SOURCES PAGE';
  return `DATA CURRENT TO ${new Date(value)
    .toLocaleString('en-AU', {
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const dataCurrentAt = await lastIngestAt();

  return (
    <html
      lang="en-AU"
      className={plexMono.variable}
      suppressHydrationWarning
    >
      <head>
        {/*
          Static, developer-authored string with no interpolated input. It sets
          the stored theme before first paint so the page never flashes the
          system theme on the way to the chosen one.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a href="#main-content" className="sr-only skip-link">
          Skip to content
        </a>

        <header className="site-header rule-masthead">
          <div className="container masthead">
            <Link href="/" aria-label="Policai A2J home" className="brand">
              <RadarMark />
              <span className="brand-wordmark">Policai A2J</span>
            </Link>
            <Nav />
            <div className="header-actions">
              <ThemeToggle />
            </div>
          </div>

          <div className="dateline">
            <div className="container">
              <span className="dateline-desktop">{formatDataDate(dataCurrentAt)}</span>
              <span className="dateline-mobile">
                {formatDataDate(dataCurrentAt).replace('DATA CURRENT TO ', 'CURRENT · ')}
              </span>
              <div className="dateline-links">
                <span className="live-status"><i /> Live</span>
                <Link href="/health" className="underline-grow">
                  Source health
                </Link>
                <a
                  href="https://github.com/l0cka/probono-radar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-grow"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </header>

        <main id="main-content">{children}</main>

        <footer className="site-footer">
          <div className="container">
            <p>
              A standing watch on Australian pro bono and access to justice. Every item links to the
              source it was collected from, and the collector&rsquo;s run history is public.
            </p>
            <div className="footer-links">
              <Link href="/health" className="underline-grow">
                Source health
              </Link>
              <Link href="/deadlines" className="underline-grow">
                Deadlines
              </Link>
              <a
                href="https://policai.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-grow"
              >
                Policai
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
