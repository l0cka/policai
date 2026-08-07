'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import type { CollectionHealthStatus } from '@/types';

const navItems = [
  { href: '/', label: 'Register' },
  { href: '/developments', label: 'Developments' },
  { href: '/courts', label: 'Courts' },
];

const insightItems = [
  { href: '/map', label: 'Map' },
  { href: '/agencies', label: 'Agencies' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/network', label: 'Network' },
  { href: '/framework', label: 'Framework' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/blog', label: 'Blog' },
];

function formatDataDate(value: string | null): string {
  if (!value) return 'SOURCE STATUS IN METHODOLOGY';

  return `DATA CURRENT TO ${new Date(value).toLocaleString('en-AU', {
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
        'group relative flex h-full items-center px-1 text-[15px] font-medium transition-colors duration-[var(--dur-fast)]',
        active ? 'text-white' : 'text-white/58 hover:text-white',
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 h-[3px] origin-left bg-[#77dcc2] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)]',
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
  const insightsRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insightsRef.current && !insightsRef.current.contains(e.target as Node)) {
        setInsightsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInsightsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/policies');
    return pathname === href || pathname.startsWith(href + '/');
  };

  const insightsActive = insightItems.some((item) => isActive(item.href));

  return (
    <header className="rule-masthead sticky top-0 z-50 w-full bg-[#071b2e]/95 text-white backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center px-4 sm:h-[4.6rem] sm:px-6 lg:px-8">
        <Link href="/" aria-label="Policai home" className="shrink-0">
          <PolicaiLogo
            className="transition-opacity duration-[var(--dur-base)] hover:opacity-75"
            iconClassName="h-9 w-9 max-sm:h-8 max-sm:w-8"
            imageClassName="brightness-0 invert"
            textClassName="text-[1.3rem] tracking-[0.08em] text-white max-sm:text-lg"
          />
        </Link>

        <nav aria-label="Primary" className="mx-auto hidden h-full items-center gap-8 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}

          <div ref={insightsRef} className="relative h-full">
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              aria-haspopup="menu"
              aria-expanded={insightsOpen}
              className={cn(
                'group relative flex h-full items-center gap-1 px-1 text-[15px] font-medium transition-colors duration-[var(--dur-fast)]',
                insightsActive ? 'text-white' : 'text-white/58 hover:text-white',
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
                  'absolute inset-x-0 bottom-0 h-[3px] origin-left bg-[#77dcc2] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)]',
                  insightsActive || insightsOpen
                    ? 'scale-x-100'
                    : 'scale-x-0 group-hover:scale-x-100',
                )}
              />
            </button>
            {insightsOpen && (
              <div
                className="dropdown-in absolute left-0 top-full z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-[var(--shadow-lift)]"
                role="menu"
              >
                {insightItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setInsightsOpen(false)}
                    role="menuitem"
                    className={cn(
                      'ink-rail block px-4 py-2 text-sm transition-colors duration-[var(--dur-fast)]',
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
            href="https://probono.policai.org"
            className="group relative flex h-full items-center gap-1 px-1 text-[15px] font-medium text-white/58 transition-colors duration-[var(--dur-fast)] hover:text-white"
          >
            A2J
            <ArrowUpRight className="h-3.5 w-3.5 opacity-55 transition duration-[var(--dur-base)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-[#77dcc2] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)] group-hover:scale-x-100"
            />
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <div className="hidden items-center gap-5 text-xs text-white/70 sm:flex">
            <Link href="/api/policies" className="underline-grow hover:text-white">
              API
            </Link>
            <a
              href="https://github.com/l0cka/policai/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-grow hover:text-white"
            >
              Feedback
            </a>
          </div>
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white hover:bg-white/10 hover:text-white"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[270px]">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Browse Policai sections and resources.
              </SheetDescription>
              <nav aria-label="Mobile" className="mt-8 flex flex-col gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded px-3 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
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
                    className={cn(
                      'rounded px-3 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
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
                  href="https://probono.policai.org"
                  className="flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground"
                >
                  A2J
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-55" />
                </a>
                <div className="my-3 border-t border-border" />
                <div className="flex items-center justify-between px-3">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Theme
                  </span>
                  <ThemeToggle />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="border-t border-white/18 bg-[#061727] text-white">
        <div className="container mx-auto flex h-[3.35rem] items-center justify-between gap-6 px-4 font-mono text-[10px] tracking-[0.04em] sm:px-6 lg:px-8">
          <span className="text-white/62">{formatDataDate(dataCurrentAt)}</span>
          <div className="hidden items-center gap-3 sm:flex">
            <span
              className={cn(
                'inline-flex items-center gap-2 uppercase tracking-[0.12em]',
                collectionHealth === 'healthy' ? 'text-[#77dcc2]' : 'text-[#efb65e]',
              )}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              {collectionHealth === 'healthy' ? 'Live' : collectionHealth}
            </span>
            <span className="text-white/58">
              {collectionHealth === 'healthy'
                ? `All ${dueSourceCount} due sources reached`
                : `${successfulSourceCount}/${dueSourceCount} due sources reached`}
            </span>
            <span className="text-white/25">·</span>
            <Link href="/methodology" className="underline-grow text-[#9bb6ff] hover:text-white">
              Source health
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
