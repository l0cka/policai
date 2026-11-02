'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ARTICLE_TYPES, ARTICLE_TYPE_NAMES, isArticleType, type ArticleType } from '@/types';
import { cn } from '@/lib/utils';

const FILTERS = [
  { href: '/analysis', label: 'All', type: undefined },
  ...ARTICLE_TYPES.map((type) => ({
    href: `/analysis?type=${type}`,
    label: ARTICLE_TYPE_NAMES[type],
    type,
  })),
];

export function AnalysisTypeNav({ active }: { active?: ArticleType }) {
  return (
    <nav aria-label="Filter by format" className="flex flex-wrap gap-2 border-b border-[var(--rule-heavy)] pb-3">
      {FILTERS.map((filter) => (
        <Link
          key={filter.href}
          href={filter.href}
          aria-current={filter.type === active ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium',
            filter.type === active
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {filter.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The page is prerendered with every article, so ?type= filters in the
 * browser: articles of other formats are hidden by their data-article-type.
 */
export function AnalysisTypeFilter({ publishedTypes }: { publishedTypes: ArticleType[] }) {
  const requested = useSearchParams().get('type');
  const type = requested && isArticleType(requested) ? requested : undefined;
  return (
    <>
      <AnalysisTypeNav active={type} />
      {type ? <style>{`[data-article-type]:not([data-article-type="${type}"]){display:none}`}</style> : null}
      {type && !publishedTypes.includes(type) ? (
        <p className="border-b border-border py-10 text-center text-sm font-medium">
          No published {ARTICLE_TYPE_NAMES[type].toLowerCase()} yet
        </p>
      ) : null}
    </>
  );
}
