'use client';

import { useState, useRef, useEffect, type FocusEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';
import { formatCollectedAt } from '@/lib/collection-strip';
import { A2J_URL, ABOUT_SECTION, PRIMARY_SECTIONS, isSectionActive } from '@/lib/site-nav';
import type { CollectionHealthStatus } from '@/types';

/** Nav label whose underline wipes in from the left, and stays for the current section. */
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

/** The collector's last run, as a dot that links to Source status. */
function SourceStatusLink({
  collectedAt,
  collectionHealth,
  successfulSourceCount,
  dueSourceCount,
  onNavigate,
  labelled = false,
  className,
}: {
  collectedAt: string | null;
  collectionHealth: CollectionHealthStatus;
  successfulSourceCount: number;
  dueSourceCount: number;
  onNavigate?: () => void;
  /** Show the label at every width; the header bar hides it on phones when healthy. */
  labelled?: boolean;
  className?: string;
}) {
  const healthy = collectionHealth === 'healthy';
  const reach = healthy
    ? `All ${dueSourceCount} due sources reached`
    : `${successfulSourceCount}/${dueSourceCount} due sources reached`;
  const collected = formatCollectedAt(collectedAt);
  return (
    <Link
      href="/status"
      onClick={onNavigate}
      title={`${collected}. ${reach}.`}
      aria-label={`Source status: ${healthy ? 'sources reached' : collectionHealth}. ${reach}. ${collected.toLowerCase()}.`}
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-75',
        healthy ? 'text-[var(--trust)]' : 'text-[var(--caution)]',
        className,
      )}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current" />
      <span className={healthy && !labelled ? 'max-sm:sr-only' : undefined}>
        {healthy ? 'Sources reached' : collectionHealth}
      </span>
    </Link>
  );
}

export function Header({
  collectedAt,
  collectionHealth,
  successfulSourceCount,
  dueSourceCount,
}: {
  collectedAt: string | null;
  collectionHealth: CollectionHealthStatus;
  successfulSourceCount: number;
  dueSourceCount: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const status = { collectedAt, collectionHealth, successfulSourceCount, dueSourceCount };

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMobileOpen(false);
      mobileButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileOpen]);

  const aboutActive = isSectionActive(ABOUT_SECTION, pathname);
  const closeMobile = () => setMobileOpen(false);

  // Tabbing out of the open menu closes it, so the overlay never hides the
  // control that receives focus next. Focus returning to the toggle keeps it.
  const closeOnFocusLeave = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || event.currentTarget.contains(next)) return;
    if (mobileButtonRef.current?.contains(next)) return;
    closeMobile();
  };

  const mobileLinkClass = (active: boolean) =>
    cn(
      'rounded min-h-11 px-3 py-3 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
      active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  return (
    <header data-site-header className="sticky top-0 z-50 w-full border-b border-border bg-background text-foreground">
      <div className="container mx-auto flex h-14 items-center gap-8 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Policai home" className="shrink-0">
          <PolicaiLogo
            className="transition-opacity duration-[var(--dur-base)] hover:opacity-75"
            iconClassName="h-8 w-8"
            textClassName="text-2xl"
          />
        </Link>

        <nav aria-label="Primary" className="hidden h-full items-center gap-6 lg:flex">
          {PRIMARY_SECTIONS.map((section) => (
            <NavLink
              key={section.href}
              href={section.href}
              label={section.label}
              active={isSectionActive(section, pathname)}
            />
          ))}
        </nav>

        <div className="ml-auto flex h-full items-center gap-5">
          <SourceStatusLink {...status} className="max-sm:min-h-11 max-sm:min-w-11 max-sm:justify-center" />
          <div className="hidden h-full items-center gap-5 lg:flex">
            <NavLink href={ABOUT_SECTION.href} label={ABOUT_SECTION.label} active={aboutActive} />
            {/* Sibling property, not a register route: no active state, and the
                arrow signals leaving this app. */}
            <a
              href={A2J_URL}
              className="group flex items-center gap-1 px-1 text-sm font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground"
            >
              A2J
              <ArrowUpRight className="h-3.5 w-3.5 opacity-55 transition duration-[var(--dur-base)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
            </a>
          </div>
          <button
            type="button"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted lg:hidden"
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
            onBlur={closeOnFocusLeave}
            className="dropdown-in absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-popover shadow-[var(--shadow-lift)] lg:hidden"
          >
            <nav aria-label="Mobile" className="flex flex-col gap-1 p-2">
              {PRIMARY_SECTIONS.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={closeMobile}
                  aria-current={isSectionActive(section, pathname) ? 'page' : undefined}
                  className={mobileLinkClass(isSectionActive(section, pathname))}
                >
                  {section.label}
                </Link>
              ))}
              <div className="my-2 border-t border-border" />
              <Link
                href={ABOUT_SECTION.href}
                onClick={closeMobile}
                aria-current={aboutActive ? 'page' : undefined}
                className={mobileLinkClass(aboutActive)}
              >
                {ABOUT_SECTION.label}
              </Link>
              <a
                href={A2J_URL}
                onClick={closeMobile}
                className={cn(mobileLinkClass(false), 'flex items-center gap-1.5')}
              >
                A2J
                <ArrowUpRight className="h-3.5 w-3.5 opacity-55" />
              </a>
              <div className="my-2 border-t border-border" />
              <div className="flex flex-col gap-1 px-3 pb-2">
                <SourceStatusLink {...status} onNavigate={closeMobile} labelled className="min-h-11" />
                <span className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground">
                  {formatCollectedAt(collectedAt)}
                </span>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
