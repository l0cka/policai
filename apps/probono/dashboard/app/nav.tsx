'use client';

import { useEffect, useRef, useState, type FocusEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from './icons';

const LINKS: Array<[string, string]> = [
  ['/', 'Feed'],
  ['/this-week', 'This week'],
  ['/deadlines', 'Deadlines'],
  ['/sector', 'Sector'],
  ['/health', 'Source health'],
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
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        menuButton.current?.focus();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  // Tabbing out of the open menu closes it, so aria-expanded does not stay
  // true over a panel the reader has left. Focus returning to the toggle keeps it.
  const closeOnFocusLeave = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || event.currentTarget.contains(next)) return;
    if (menuButton.current?.contains(next)) return;
    setOpen(false);
  };

  return (
    <>
      <nav className="site-nav" aria-label="Primary">
        <NavLinks path={path} />
        <a href="https://policai.org" className="property-link">
          Policai <ArrowUpRight />
        </a>
      </nav>

      <button
        type="button"
        className="mobile-menu-toggle"
        ref={menuButton}
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
        <div id="mobile-navigation" className="mobile-nav-panel" onBlur={closeOnFocusLeave}>
          <nav className="mobile-nav-links" aria-label="Mobile">
            <NavLinks path={path} onNavigate={() => setOpen(false)} />
            <a href="https://policai.org" className="property-link" onClick={() => setOpen(false)}>
              Policai <ArrowUpRight />
            </a>
          </nav>
        </div>
      ) : null}
    </>
  );
}
