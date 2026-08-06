import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'Pro Bono Radar' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">📡 Pro Bono Radar</Link>
          <nav>
            <Link href="/">Feed</Link>
            <Link href="/health">Health</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
