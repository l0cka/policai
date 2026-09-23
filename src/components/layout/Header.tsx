'use client';

import { useState, useRef, useEffect, type FocusEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import type { CollectionHealthStatus } from '@/types';

const navItems = [
  { href: '/', label: 'Register' },
  { href: '/this-week', label: 'This week' },
  { href: '/developments', label: 'Developments' },
  { href: '/courts', label: 'Courts' },
];

const insightItems = [
  { href: '/timeline', label: 'Timeline' },
  { href: '/network', label: 'Network' },
  { href: '/methodology', label: 'Methodology' },
];

function formatDataDate(value: string | null): string {
  if (!value) return 'SOURCE STATUS IN METHODOLOGY';

  return `COLLECTION AS AT ${new Date(value).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).toUpperCase()}`;
}

/** Nav label whose underline wipes in from the left, and stays for the current page. */
function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-full items-center px-1 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 h-[3px] origin-left bg-primary transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)]',
          active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
        )}
      />
    </Link>
  );
}

export function Header({
  dataCurrentAt,
  collectionHealth,
  successfulSourceCount,
  dueSourceCount,
}: {
  dataCurrentAt: string | null;
  collectionHealth: CollectionHealthStatus;
  successfulSourceCount: number;
  dueSourceCount: number;
}) {
  const pathname = usePathname();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insightsRef.current && !insightsRef.current.contains(e.target as Node)) {
        setInsightsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (insightsOpen) insightsRef.current?.querySelector('button')?.focus();
        if (mobileOpen) mobileButtonRef.current?.focus();
        setInsightsOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [insightsOpen, mobileOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/policies');
    return pathname === href || pathname.startsWith(href + '/');
  };

  const insightsActive = insightItems.some((item) => isActive(item.href));

  // Tabbing out of an open menu closes it, so the overlay never hides the
  // control that receives focus next.
  const closeOnFocusLeave =
    (close: () => void, keepOpenFor?: HTMLElement | null) =>
    (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget as Node | null;
      if (!next || event.currentTarget.contains(next)) return;
      if (keepOpenFor && keepOpenFor.contains(next)) return;
      close();
    };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background text-foreground">
      <div className="container mx-auto flex h-14 items-center px-4 sm:h-24 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Policai home" className="shrink-0">
          <PolicaiLogo
            className="transition-opacity duration-[var(--dur-base)] hover:opacity-75"
            iconClassName="h-9 w-9 max-sm:h-8 max-sm:w-8"
            textClassName="max-sm:text-2xl"
          />
        </Link>

        <nav aria-label="Primary" className="mx-auto hidden h-full items-center gap-5 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}

          <div
            ref={insightsRef}
            className="relative h-full"
            onBlur={closeOnFocusLeave(() => setInsightsOpen(false))}
          >
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              aria-controls="explore-navigation"
              aria-expanded={insightsOpen}
              className={cn(
                'group relative flex h-full items-center gap-1 px-1 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
                insightsActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Explore
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)]',
                  insightsOpen && 'rotate-180',
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 bottom-0 h-[3px] origin-left bg-primary transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)]',
                  insightsActive || insightsOpen
                    ? 'scale-x-100'
                    : 'scale-x-0 group-hover:scale-x-100',
                )}
              />
            </button>
            {insightsOpen && (
              <div
                className="dropdown-in absolute left-0 top-full z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-[var(--shadow-lift)]"
                id="explore-navigation"
              >
                {insightItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setInsightsOpen(false)}
                    className={cn(
                      'block min-h-11 px-4 py-3 text-sm transition-colors duration-[var(--dur-fast)]',
                      isActive(item.href)
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Sibling property, not a register route: no active state, and the
              arrow signals leaving this app. */}
          <a
            href="https://a2j.policai.org"
            className="group relative flex h-full items-center gap-1 px-1 text-sm font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground"
          >
            A2J
            <ArrowUpRight className="h-3.5 w-3.5 opacity-55 transition duration-[var(--dur-base)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-primary transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)] group-hover:scale-x-100"
            />
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <div className="hidden items-center gap-4 text-xs text-muted-foreground xl:flex">
            <Link href="/api/policies" className="underline-grow hover:text-foreground">
              API
            </Link>
            <a
              href="https://github.com/l0cka/policai/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-grow hover:text-foreground"
            >
              Feedback
            </a>
          </div>
          <ThemeToggle className="hidden lg:inline-flex" />
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted lg:hidden"
            aria-expanded={mobileOpen}
            ref={mobileButtonRef}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div
            id="mobile-navigation"
            onBlur={(event) =>
              closeOnFocusLeave(
                () => setMobileOpen(false),
                mobileButtonRef.current,
              )(event)
            }
            className="dropdown-in absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4.5rem)] overflow-y-auto border border-border bg-popover shadow-[var(--shadow-lift)] lg:hidden"
          >
            <nav aria-label="Mobile" className="flex flex-col gap-1 p-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded min-h-11 px-3 py-3 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
                    isActive(item.href)
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-2 border-t border-border" />
              <div className="px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Explore
              </div>
              {insightItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded min-h-11 px-3 py-3 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
                    isActive(item.href)
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-2 border-t border-border" />
              <a
                href="https://a2j.policai.org"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-1.5 rounded min-h-11 px-3 py-3 text-sm font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground"
              >
                A2J
                <ArrowUpRight className="h-3.5 w-3.5 opacity-55" />
              </a>
              <Link href="/api/policies" onClick={() => setMobileOpen(false)} className="min-h-11 px-3 py-3 text-sm text-muted-foreground">API</Link>
              <a href="https://github.com/l0cka/policai/issues" target="_blank" rel="noopener noreferrer" className="min-h-11 px-3 py-3 text-sm text-muted-foreground">Feedback</a>
              <div className="my-3 border-t border-border" />
              <div className="flex items-center justify-between px-3">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Theme
                </span>
                <ThemeToggle />
              </div>
            </nav>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-muted/40 text-muted-foreground">
        <div className="container mx-auto flex min-h-9 flex-wrap py-2 items-center justify-between gap-6 px-4 font-mono text-[10px] tracking-[0.04em]  sm:px-6 lg:px-8">
          <span className="text-muted-foreground sm:inline">
            <span className="hidden sm:inline">{formatDataDate(dataCurrentAt)}</span>
            <span className="sm:hidden">
              {formatDataDate(dataCurrentAt)}
            </span>
          </span>
          <div className="hidden items-center gap-3 sm:flex">
            <span
              className={cn(
                'inline-flex items-center gap-2 uppercase tracking-[0.12em]',
                collectionHealth === 'healthy' ? 'text-[var(--trust)]' : 'text-[var(--caution)]',
              )}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              {collectionHealth === 'healthy' ? 'Sources reached' : collectionHealth}
            </span>
            <span className="text-muted-foreground">
              {collectionHealth === 'healthy'
                ? `All ${dueSourceCount} due sources reached`
                : `${successfulSourceCount}/${dueSourceCount} due sources reached`}
            </span>
            <span className="text-muted-foreground">·</span>
            <Link href="/status" className="underline-grow text-primary hover:text-foreground">
              Source health
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
