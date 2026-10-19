import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { collectionStripProps } from '@/lib/collection-strip';
import { Footer } from '@/components/layout/Footer';
import { themeInitScript } from '@/components/layout/theme-init';
import { BackToTop } from '@/components/ui/back-to-top';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WebMcpTools } from '@/components/webmcp-tools';
import { getCollectionMeta } from '@/lib/data-service';
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_SOCIAL_DEFAULTS,
  SITE_TITLE,
  SITE_URL,
  siteJsonLd,
} from '@/lib/site-seo';
import { parseSourceUrl } from '@/lib/source-url';

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [...SITE_KEYWORDS],
  metadataBase: parseSourceUrl(SITE_URL),
  // Do not set alternates.canonical here — Next merges layout metadata into
  // every route; a root canonical of "/" would wrongly tag child pages.
  // Same for openGraph title/url/description — keep only shared defaults.
  alternates: {
    types: {
      'application/atom+xml': [
        { url: `${SITE_URL}/feed.xml`, title: 'Policai register feed' },
        { url: `${SITE_URL}/analysis/feed.xml`, title: 'Policai analysis' },
      ],
    },
  },
  openGraph: SITE_SOCIAL_DEFAULTS.openGraph,
  twitter: SITE_SOCIAL_DEFAULTS.twitter,
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const collectionMeta = await getCollectionMeta();

  return (
    <html
      lang="en-AU"
      suppressHydrationWarning
    >
      <head>
        <script>{themeInitScript}</script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: siteJsonLd() }}
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        <WebMcpTools />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
          Skip to content
        </a>
        <TooltipProvider>
          <Header {...collectionStripProps(collectionMeta)} />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <BackToTop />
        </TooltipProvider>
      </body>
    </html>
  );
}
