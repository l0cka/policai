import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { AnalysisTypeFilter, AnalysisTypeNav } from '@/components/analysis-type-filter';
import { PageIntro } from '@/components/layout';
import {
  ArticleDate,
  ArticleThumbnail,
  ArticleTypeLabel,
  Byline,
} from '@/components/analysis';
import { getArticles } from '@/lib/data-service';
import { cn } from '@/lib/utils';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const ANALYSIS_TITLE = 'Analysis of Australian AI policy';
const ANALYSIS_DESCRIPTION =
  "Policai's own analysis for practitioners: weekly briefings, instrument notes and explainers, each citing the verified register and official sources.";

export const metadata: Metadata = {
  title: ANALYSIS_TITLE,
  description: ANALYSIS_DESCRIPTION,
  alternates: pageAlternates('/analysis'),
  ...pageSocialMeta({
    title: ANALYSIS_TITLE,
    description: ANALYSIS_DESCRIPTION,
    path: '/analysis',
  }),
};

export default async function AnalysisPage() {
  const articles = await getArticles();
  const publishedTypes = [...new Set(articles.map((article) => article.type))];

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Analysis"
        eyebrow="Analysis · all pieces"
        description="Written pieces signed by Policai. They are Policai's analysis, separate from the verified register and from automated developments. Every factual claim cites a verified register record or an official source."
      />

      <Suspense fallback={<AnalysisTypeNav />}>
        <AnalysisTypeFilter publishedTypes={publishedTypes} />
      </Suspense>

      {articles.length > 0 ? (
        <div>
          {articles.map((article, index) => (
            <article
              key={article.slug}
              data-article-type={article.type}
              className={cn(
                'grid gap-2 border-b border-[var(--rule-hair)] py-[var(--space-6)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)] sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-[var(--space-8)] lg:grid-cols-[8rem_minmax(0,40rem)] lg:justify-start',
                article.image && 'sm:grid-cols-[8rem_minmax(0,1fr)_10rem] lg:grid-cols-[8rem_minmax(0,40rem)_10rem]',
              )}
            >
              <p className="font-mono text-[length:var(--type-label)] uppercase tracking-[0.08em] text-muted-foreground tabular">
                <ArticleDate date={article.publishedAt} />
              </p>
              <div className="min-w-0">
                <ArticleTypeLabel type={article.type} />
                <h2 className="mt-2">
                  <Link href={`/analysis/${article.slug}`} className="record-title hover:text-primary">
                    {article.title}
                  </Link>
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {article.summary}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <Byline />
                  {article.updatedAt ? <ArticleDate label="Updated" date={article.updatedAt} /> : null}
                  {article.sourceUnderReview ? (
                    <span className="text-[var(--caution)]">Source under review</span>
                  ) : null}
                </p>
              </div>
              {article.image ? (
                <Link href={`/analysis/${article.slug}`} tabIndex={-1} aria-hidden="true" className="order-first sm:order-last">
                  <ArticleThumbnail
                    image={article.image}
                    sizes="(min-width: 640px) 160px, 100vw"
                    priority={index === articles.findIndex((candidate) => candidate.image)}
                  />
                </Link>
              ) : null}
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
