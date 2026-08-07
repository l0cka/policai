import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Public_Sans } from 'next/font/google';
import Link from 'next/link';
import Nav from './nav';
import ThemeToggle, { themeInitScript } from './theme-toggle';
import { RadarMark } from './icons';
import { getPool } from '../lib/db';
import './globals.css';

export const dynamic = 'force-dynamic';

const displaySerif = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  style: ['normal', 'italic'],
  display: 'swap',
});

const interfaceSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

const metadataMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Policai A2J',
  description:
    'A monitor of Australian pro bono, access-to-justice and legal assistance news, law reform, funding and deadlines, each item linked to its source.',
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
      className={`${displaySerif.variable} ${interfaceSans.variable} ${metadataMono.variable}`}
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
          <div className="dateline">
            <div className="container">
              <span>{formatDataDate(dataCurrentAt)}</span>
              <div className="dateline-links">
                <Link href="/health" className="underline-grow">
                  Sources
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
