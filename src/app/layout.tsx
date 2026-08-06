import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Public_Sans } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { themeInitScript } from '@/components/layout/ThemeToggle';
import { BackToTop } from '@/components/ui/back-to-top';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getCollectionMeta } from '@/lib/data-service';

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
  title: 'Policai — Australian AI Policy and Governance Tracker',
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
      <body className="antialiased min-h-screen flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
          Skip to content
        </a>
        <TooltipProvider>
          <Header dataCurrentAt={dataCurrentAt} />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <BackToTop />
        </TooltipProvider>
      </body>
    </html>
  );
}
