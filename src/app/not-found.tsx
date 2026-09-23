import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found - Policai',
};

const destinations = [
  { href: '/', label: 'Policy register', note: 'Every verified Australian AI policy record' },
  { href: '/this-week', label: 'This week', note: 'Verified developments and dates coming up' },
  { href: '/developments', label: 'Developments', note: 'Updates detected on official sources' },
  { href: '/courts', label: 'Courts and tribunals', note: 'Practice notes and guidance on AI use' },
];

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <p className="page-eyebrow">Error 404</p>
      <h1 className="page-title mt-2">This page could not be found.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        The address may be mistyped, or the page may have been retired. The map,
        framework, agency and blog pages were removed; their records remain in
        the register.
      </p>
      <ul className="mt-8 max-w-2xl border-t border-border">
        {destinations.map((item) => (
          <li key={item.href} className="border-b border-border">
            <Link
              href={item.href}
              className="group flex min-h-14 items-center justify-between gap-4 py-3 hover:text-primary"
            >
              <span>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.note}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
