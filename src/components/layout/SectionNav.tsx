'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sectionForView } from '@/lib/site-nav';

/** Views of the current section, shown only on the pages those views name. */
export function SectionNav() {
  const pathname = usePathname();
  const section = sectionForView(pathname);
  if (!section) return null;

  return (
    <nav aria-label={`${section.label} views`} className="border-b border-[var(--rule-hair)]">
      <div className="container mx-auto flex flex-wrap items-stretch gap-x-6 px-4 sm:px-6 lg:px-8">
        {section.views.map((view) => {
          const active = view.href === pathname;
          return (
            <Link
              key={view.href}
              href={view.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-11 shrink-0 items-center text-sm transition-colors duration-[var(--dur-fast)]',
                active
                  ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {view.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
