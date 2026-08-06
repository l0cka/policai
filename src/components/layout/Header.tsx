'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, Search } from 'lucide-react';
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
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
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

export function Header({ dataCurrentAt }: { dataCurrentAt: string | null }) {
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
    <header className="rule-masthead sticky top-0 z-50 w-full bg-background/90 backdrop-blur-md">
      {/* Dateline strip, in the manner of a masthead's edition line. */}
      <div className="bg-[var(--navy)] text-white">
        <div className="container mx-auto flex h-7 items-center justify-between px-4 font-mono text-[9px] uppercase tracking-[0.12em] sm:px-6 lg:px-8 lg:text-[10px]">
          <span className="hidden sm:inline">{formatDataDate(dataCurrentAt)}</span>
          <span className="sm:hidden">
            {formatDataDate(dataCurrentAt).replace('DATA CURRENT TO ', 'CURRENT · ')}
          </span>
          <div className="hidden items-center gap-5 sm:flex">
            <Link href="/api/policies" className="underline-grow">
              API
            </Link>
            <a
              href="https://github.com/l0cka/policai/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-grow"
            >
              Feedback
            </a>
          </div>
        </div>
      </div>

      <div className="container mx-auto flex h-14 items-center px-4 sm:h-[4.25rem] sm:px-6 lg:px-8">
        <Link href="/" aria-label="Policai home" className="shrink-0">
          <PolicaiLogo
            className="transition-opacity duration-[var(--dur-base)] hover:opacity-75"
            iconClassName="h-9 w-9 max-sm:h-8 max-sm:w-8"
            textClassName="text-[1.3rem] tracking-[0.08em] max-sm:text-lg"
          />
        </Link>

        <nav className="mx-auto hidden h-full items-center gap-8 md:flex">
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
                insightsActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
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
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <Link
            href="/#policy-search"
            aria-label="Search the policy register"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-muted hover:text-primary"
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <ThemeToggle className="max-sm:hidden" />
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[270px]">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Browse Policai sections and resources.
              </SheetDescription>
              <nav className="mt-8 flex flex-col gap-1">
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
                <div className="px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
                <div className="my-3 border-t border-border" />
                <div className="flex items-center justify-between px-3">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Theme
                  </span>
                  <ThemeToggle />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
