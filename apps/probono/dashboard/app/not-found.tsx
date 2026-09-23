import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from './icons';

export const metadata: Metadata = {
  title: 'Page not found',
};

const DESTINATIONS: Array<[string, string, string]> = [
  ['/', 'Feed', 'Every access-to-justice signal, newest first'],
  ['/this-week', 'This week', 'The rolling seven-day brief'],
  ['/deadlines', 'Deadlines', 'Consultations, submissions and grants closing soon'],
  ['/sector', 'Sector', 'Funding and referral structure by jurisdiction'],
];

export default function NotFound() {
  return (
    <div className="container page">
      <header className="page-head">
        <p className="page-eyebrow">Error 404</p>
        <h1 className="page-title">This page could not be found.</h1>
        <p className="page-intro">The address may be mistyped, or the page may have moved.</p>
      </header>
      <ul className="not-found-links">
        {DESTINATIONS.map(([href, label, note]) => (
          <li key={href}>
            <Link href={href}>
              <span>
                <strong>{label}</strong>
                <span>{note}</span>
              </span>
              <ArrowRight />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
