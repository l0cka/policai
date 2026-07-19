'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';

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
  if (!value) return 'SOURCE STATUS AVAILABLE IN METHODOLOGY';

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

export function Header({ dataCurrentAt }: { dataCurrentAt: string | null }) {
  const pathname = usePathname();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insightsRef.current && !insightsRef.current.contains(e.target as Node)) {
        setInsightsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/policies');
    return pathname === href || pathname.startsWith(href + '/');
  };

  const insightsActive = insightItems.some((item) => isActive(item.href));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
      <div className="bg-[var(--navy)] text-white">
        <div className="container mx-auto flex h-7 items-center justify-between px-4 font-mono text-[9px] uppercase tracking-[0.12em] sm:px-6 lg:px-8 lg:text-[10px]">
          <span className="hidden sm:inline">Policai — Australian AI policy tracker</span>
          <span className="sm:hidden">{formatDataDate(dataCurrentAt).replace('DATA CURRENT TO ', 'DATA CURRENT · ')}</span>
          <div className="hidden items-center gap-5 sm:flex">
            <span>{formatDataDate(dataCurrentAt)}</span>
            <span aria-hidden="true">•</span>
            <Link href="/methodology" className="hover:text-white/75">About</Link>
            <Link href="/api/policies" className="hover:text-white/75">API</Link>
            <a href="https://github.com/l0cka/policai/issues" target="_blank" rel="noopener noreferrer" className="hover:text-white/75">Feedback</a>
          </div>
        </div>
      </div>
      <div className="container mx-auto flex h-16 items-center px-4 sm:h-[5.25rem] sm:px-6 lg:px-8">
        <Link href="/" aria-label="Policai home">
          <PolicaiLogo
            className="transition-opacity hover:opacity-80"
            iconClassName="h-12 w-12 max-sm:h-10 max-sm:w-10"
            textClassName="text-[1.75rem] tracking-[0.08em] max-sm:text-xl"
          />
        </Link>

        <nav className="mx-auto hidden h-full items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex h-full items-center border-b-[3px] px-1 pt-[3px] text-[15px] font-medium transition-colors',
                isActive(item.href)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
          {/* Explore dropdown */}
          <div ref={insightsRef} className="relative">
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              aria-haspopup="menu"
              aria-expanded={insightsOpen}
              className={cn(
                'flex h-full items-center gap-1 border-b-[3px] px-1 pt-[3px] text-[15px] font-medium transition-colors',
                insightsActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Explore
              <ChevronDown className={cn('h-3 w-3 transition-transform', insightsOpen && 'rotate-180')} />
            </button>
            {insightsOpen && (
              <div className="absolute left-0 top-full z-50 min-w-[168px] border border-border bg-popover py-1 shadow-lg" role="menu">
                {insightItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setInsightsOpen(false)}
                    role="menuitem"
                    className={cn(
                      'block px-4 py-2 text-sm transition-colors',
                      isActive(item.href)
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/#policy-search"
            aria-label="Search the policy register"
            className="flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary"
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <span className="hidden h-7 w-px bg-border md:block" />
          <Link href="/methodology" className="hidden text-sm font-medium hover:text-primary md:block">
            Methodology
          </Link>
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[250px]">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="mt-8 flex flex-col gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded transition-colors',
                      isActive(item.href)
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
                      'px-3 py-2 text-sm font-medium rounded transition-colors',
                      isActive(item.href)
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
