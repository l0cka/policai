'use client';

import { Fragment, useState, useRef, useEffect, useSyncExternalStore, type FocusEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PolicaiLogo } from '@/components/layout/PolicaiLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import {
  collectionStatusLabel,
  formatCollectedAt,
  isCollectionStale,
  type CollectionStrip,
} from '@/lib/collection-strip';
import { A2J_URL, ABOUT_SECTION, PRIMARY_SECTIONS, isSectionActive, type NavSection } from '@/lib/site-nav';

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

function subscribeToReturn(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function SourceStatusLink({
  status,
  stale,
  onNavigate,
  labelled = false,
  className,
}: {
  status: CollectionStrip;
  stale: boolean;
  onNavigate?: () => void;
  labelled?: boolean;
  className?: string;
}) {
  const { collectedAt, collectionHealth, successfulSourceCount, dueSourceCount } = status;
  const healthy = collectionHealth === 'healthy';
  const calm = healthy && !stale;
  const reach = healthy
    ? `All ${dueSourceCount} due sources reached`
    : `${successfulSourceCount}/${dueSourceCount} due sources reached`;
  const collected = formatCollectedAt(collectedAt);
  const label = collectionStatusLabel(status, stale);
  const spoken = stale ? [label, reach] : [label, reach, collected];
  return (
    <Link
      href="/status"
      onClick={onNavigate}
      title={`${collected}. ${reach}.`}
      aria-label={`Source status: ${spoken.join('. ').toLowerCase()}.`}
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-75',
        calm ? 'text-[var(--trust)]' : 'text-[var(--caution)]',
        className,
      )}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current" />
      <span
        className={cn(
          !labelled && (calm ? 'max-sm:sr-only' : 'max-sm:max-w-[7.5rem] max-sm:leading-tight'),
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function Header(status: CollectionStrip) {
  const { collectedAt, renderedAt } = status;
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const stale = useSyncExternalStore(
    subscribeToReturn,
    () => isCollectionStale(collectedAt, Date.now()),
    () => isCollectionStale(collectedAt, Date.parse(renderedAt)),
  );

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

  const mobileSection = (section: NavSection) => {
    const views = section.views.filter((view) => view.href !== section.href);
    const onView = views.some((view) => view.href === pathname);
    const current = isSectionActive(section, pathname) && !onView;
    return (
      <Fragment key={section.href}>
        <Link
          href={section.href}
          onClick={closeMobile}
          aria-current={current ? 'page' : undefined}
          className={mobileLinkClass(current)}
        >
          {section.label}
        </Link>
        {views.length > 0 && (
          <div className="ml-3 flex flex-col gap-1 border-l border-border pl-2">
            {views.map((view) => (
              <Link
                key={view.href}
                href={view.href}
                onClick={closeMobile}
                aria-current={view.href === pathname ? 'page' : undefined}
                className={cn(mobileLinkClass(view.href === pathname), 'font-normal')}
              >
                {view.label}
              </Link>
            ))}
          </div>
        )}
      </Fragment>
    );
  };

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
          <SourceStatusLink status={status} stale={stale} className="min-h-11 max-sm:min-w-11 max-sm:justify-center" />
          <div className="hidden h-full items-center gap-5 lg:flex">
            <NavLink href={ABOUT_SECTION.href} label={ABOUT_SECTION.label} active={aboutActive} />
            {/* Sibling property, not a register route: no active state, and the
                arrow signals leaving this app. */}
            <a
              href={A2J_URL}
              className="group flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground"
            >
              A2J
              <ArrowUpRight className="h-3.5 w-3.5 opacity-55 transition duration-[var(--dur-base)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
            </a>
            <ThemeToggle label="Colour theme, header" size="compact" />
          </div>
          <button
            type="button"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted lg:hidden"
            aria-expanded={mobileOpen}
            ref={mobileButtonRef}
            aria-controls={mobileOpen ? 'mobile-navigation' : undefined}
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
              {PRIMARY_SECTIONS.map(mobileSection)}
              <div className="my-2 border-t border-border" />
              {mobileSection(ABOUT_SECTION)}
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
                <SourceStatusLink status={status} stale={stale} onNavigate={closeMobile} labelled className="min-h-11" />
                <span className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground">
                  {formatCollectedAt(collectedAt)}
                </span>
                <ThemeToggle label="Colour theme, menu" className="mt-2 self-start" />
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
