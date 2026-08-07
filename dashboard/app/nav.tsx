'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './theme-toggle';

const LINKS: Array<[string, string]> = [
  ['/', 'Feed'],
  ['/deadlines', 'Deadlines'],
  ['/sector', 'Sector'],
  ['/health', 'Sources'],
];

function NavLinks({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate?: () => void;
}) {
  return LINKS.map(([href, label]) => {
    const active = href === '/' ? path === '/' : path.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={active ? 'active' : ''}
        onClick={onNavigate}
      >
        {label}
      </Link>
    );
  });
}

/** Primary navigation, with a compact mobile drawer matching Policai's shell. */
export default function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <>
      <nav className="site-nav" aria-label="Primary">
        <NavLinks path={path} />
      </nav>

      <button
        type="button"
        className="mobile-menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open ? (
        <div id="mobile-navigation" className="mobile-nav-panel">
          <nav className="mobile-nav-links" aria-label="Mobile">
            <NavLinks path={path} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="mobile-theme-row">
            <span>Theme</span>
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </>
  );
}
