'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: Array<[string, string]> = [
  ['/', 'Feed'],
  ['/deadlines', 'Deadlines'],
  ['/health', 'Sources'],
];

/**
 * Nav labels whose underline wipes in from the left, and stays for the current
 * page. The rule itself is a `::after` on the link (see `.site-nav` in
 * globals.css) so the markup stays a plain list of links.
 */
export default function Nav() {
  const path = usePathname();
  return (
    <nav className="site-nav">
      {LINKS.map(([href, label]) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={active ? 'active' : ''}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
