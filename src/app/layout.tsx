import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { themeInitScript } from '@/components/layout/ThemeToggle';
import { BackToTop } from '@/components/ui/back-to-top';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getCollectionMeta } from '@/lib/data-service';

// One face for the whole site, matching the A2J property: IBM Plex Mono
// carries body, headings and data alike, and `ch` becomes an exact unit.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Policai - Australian AI Policy and Governance Tracker',
  description:
    'A register of AI policy, regulation and court guidance from Australian federal, state and territory governments, each record linked to its official source.',
  keywords: [
    'Australian AI policy',
    'AI regulation',
    'artificial intelligence',
    'government policy',
    'AI governance Australia',
  ],
  metadataBase: new URL('https://policai.org'),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const collectionMeta = await getCollectionMeta();
  const dataCurrentAt =
    collectionMeta.lastHealthyAt ?? collectionMeta.lastCollectedAt;

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
      <body className="antialiased min-h-screen flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
          Skip to content
        </a>
        <TooltipProvider>
          <Header
            dataCurrentAt={dataCurrentAt}
            collectionHealth={collectionMeta.collector.health}
            successfulSourceCount={collectionMeta.collector.successfulSourceCount}
            dueSourceCount={collectionMeta.collector.dueSourceCount}
          />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <BackToTop />
        </TooltipProvider>
      </body>
    </html>
  );
}
