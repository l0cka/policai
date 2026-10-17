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
import { parseSourceUrl } from '@/lib/source-url';

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
  metadataBase: parseSourceUrl('https://policai.org'),
  alternates: {
    types: {
      'application/atom+xml': 'https://policai.org/feed.xml',
    },
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
