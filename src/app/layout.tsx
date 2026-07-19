import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BackToTop } from '@/components/ui/back-to-top';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getCollectionMeta } from '@/lib/data-service';

export const metadata: Metadata = {
  title: 'Policai — Australian AI Policy and Governance Tracker',
  description:
    'Search and browse Australian AI policy, regulation, and governance developments across federal and state jurisdictions.',
  keywords: [
    'Australian AI policy',
    'AI regulation',
    'artificial intelligence',
    'government policy',
    'AI governance Australia',
  ],
  metadataBase: new URL('https://policai.com.au'),
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
    <html lang="en-AU">
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
