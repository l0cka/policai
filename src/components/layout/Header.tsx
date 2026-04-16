'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { SiteDisclaimerBanner } from '@/components/layout/SiteDisclaimerBanner';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';

const navItems = [
  { href: '/', label: 'Policies' },
  { href: '/courts', label: 'Courts' },
  { href: '/map', label: 'Map' },
  { href: '/agencies', label: 'Agencies' },
  { href: '/blog', label: 'Blog' },
];

const moreItems = [
  { href: '/network', label: 'Network' },
  { href: '/framework', label: 'Framework' },
  { href: '/timeline', label: 'Timeline' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, isLoading } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/policies');
    return pathname === href || pathname.startsWith(href + '/');
  };

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
          {/* More dropdown */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                'px-3 pb-3 pt-1 text-sm font-medium transition-colors border-b-2 flex items-center gap-1',
                moreItems.some(item => isActive(item.href))
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              More
              <ChevronDown className={cn('h-3 w-3 transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-md shadow-lg py-1 min-w-[140px] z-50">
                {moreItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
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
          {!isLoading && (
            <>
              {user ? (
                <div className="hidden md:flex items-center gap-3">
                  <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
                    Admin
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href="/admin/login"
                  className="hidden md:block text-sm text-muted-foreground hover:text-foreground"
                >
                  Admin
                </Link>
              )}
            </>
          )}

          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[250px]">
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
                {moreItems.map((item) => (
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
                {user ? (
                  <>
                    <Link href="/admin" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                      Admin
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link href="/admin/login" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Admin
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
