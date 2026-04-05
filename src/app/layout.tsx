import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Policai — Australian AI Policy Tracker',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased min-h-screen flex flex-col`}>
        <AuthProvider>
          <TooltipProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
