'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { SiteDisclaimerBanner } from '@/components/layout/SiteDisclaimerBanner';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';

const navItems = [
  { href: '/', label: 'Policies' },
  { href: '/developments', label: 'Developments' },
  { href: '/courts', label: 'Courts' },
  { href: '/map', label: 'Map' },
  { href: '/agencies', label: 'Agencies' },
];

const insightItems = [
  { href: '/timeline', label: 'Timeline' },
  { href: '/network', label: 'Network' },
  { href: '/framework', label: 'Framework' },
  { href: '/blog', label: 'Blog' },
];

export function Header() {
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
    <header className="sticky top-0 z-50 w-full border-b-2 border-foreground bg-background">
      <SiteDisclaimerBanner />
      <div className="container mx-auto flex h-20 items-center px-4">
        <Link href="/" aria-label="Policai home">
          <PolicaiLogo
            className="transition-opacity hover:opacity-80"
            iconClassName="h-15 w-15 max-sm:h-9 max-sm:w-9"
            textClassName="text-2xl tracking-[0.22em] max-sm:text-lg"
          />
        </Link>

        <nav className="ml-8 hidden md:flex items-center h-full gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 pb-3 pt-1 text-sm font-medium transition-colors border-b-2',
                isActive(item.href)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
          {/* Insights dropdown */}
          <div ref={insightsRef} className="relative">
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              aria-haspopup="menu"
              aria-expanded={insightsOpen}
              className={cn(
                'px-3 pb-3 pt-1 text-sm font-medium transition-colors border-b-2 flex items-center gap-1',
                insightsActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Insights
              <ChevronDown className={cn('h-3 w-3 transition-transform', insightsOpen && 'rotate-180')} />
            </button>
            {insightsOpen && (
              <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-md shadow-lg py-1 min-w-[140px] z-50" role="menu">
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

        <div className="ml-auto flex items-center gap-4">
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[250px]">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="flex flex-col gap-1 mt-8">
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
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                  Insights
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
