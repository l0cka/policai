'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { href: '/', label: 'Policies' },
  { href: '/map', label: 'Map' },
  { href: '/agencies', label: 'Agencies' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, isLoading } = useAuth();

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
      <div className="container mx-auto flex h-12 items-center px-4">
        <Link href="/" className="font-sans text-lg font-bold tracking-wide uppercase">
          Policai
        </Link>

        <nav className="ml-8 hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-[2px]',
                isActive(item.href)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
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
