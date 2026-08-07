import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from './nav';
import './globals.css';

export const metadata: Metadata = { title: 'Pro Bono Radar' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">📡 Pro Bono Radar</Link>
          <Nav />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
