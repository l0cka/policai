import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout';
import {
  AnalysisTierLabel,
  ArticleDate,
  Byline,
} from '@/components/analysis';
import { getArticles } from '@/lib/data-service';
import { ARTICLE_TYPES, ARTICLE_TYPE_NAMES, isArticleType } from '@/types';
import { cn } from '@/lib/utils';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Analysis - Policai',
  description:
    "Policai's own analysis of Australian AI policy: weekly briefings, instrument notes and explainers, each citing the verified register and official sources.",
  alternates: {
    types: {
      'application/atom+xml': [
        { url: 'https://policai.org/analysis/feed.xml', title: 'Policai analysis' },
      ],
    },
  },
};

const FILTERS = [
  { href: '/analysis', label: 'All', type: undefined },
  ...ARTICLE_TYPES.map((type) => ({
    href: `/analysis?type=${type}`,
    label: ARTICLE_TYPE_NAMES[type],
    type,
  })),
];

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type: requested } = await searchParams;
  const type = typeof requested === 'string' && isArticleType(requested) ? requested : undefined;
  const articles = await getArticles({ type });

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <PageIntro
        title="Analysis"
        description="Written pieces signed by Policai. They are Policai's analysis, separate from the verified register and from automated developments. Every factual claim cites a verified register record or an official source."
      />

      <nav aria-label="Filter by format" className="flex flex-wrap gap-2 border-b border-[var(--rule-heavy)] pb-3">
        {FILTERS.map((filter) => {
          const active = filter.type === type;
          return (
            <Link
              key={filter.href}
              href={filter.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {articles.length > 0 ? (
        <div>
          {articles.map((article) => (
            <article
              key={article.slug}
              className="grid gap-2 border-b border-border py-5 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)] sm:grid-cols-[8rem_minmax(0,1fr)]"
            >
              <p className="text-xs font-medium text-muted-foreground tabular">
                <ArticleDate date={article.publishedAt} />
              </p>
              <div className="min-w-0">
                <AnalysisTierLabel type={article.type} />
                <h2 className="mt-2">
                  <Link href={`/analysis/${article.slug}`} className="record-title hover:text-primary">
                    {article.title}
                  </Link>
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {article.summary}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <Byline />
                  {article.updatedAt ? <ArticleDate label="Updated" date={article.updatedAt} /> : null}
                  {article.sourceUnderReview ? (
                    <span className="text-[var(--caution)]">Source under review</span>
                  ) : null}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="border-b border-border py-10 text-center">
          <p className="text-sm font-medium">No published analysis yet</p>
          <p className="mt-2 text-xs text-muted-foreground">
            The <Link href="/" className="text-primary underline underline-offset-4">register</Link> and{' '}
            <Link href="/this-week" className="text-primary underline underline-offset-4">this week</Link> stay current in the meantime.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Subscribe with the <a href="/analysis/feed.xml" className="text-primary underline underline-offset-4">analysis feed</a>.
      </p>
    </div>
  );
}
