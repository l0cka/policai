'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: Array<[string, string]> = [
  ['/', 'Feed'],
  ['/deadlines', 'Deadlines'],
  ['/health', 'Health'],
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav>
      {LINKS.map(([href, label]) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? 'active' : ''}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
