import Link from 'next/link';
import { ArticleDate, ArticleThumbnail, ArticleTypeLabel, Byline } from '@/components/analysis';
import type { ArticleView } from '@/lib/data-service';
import { selectAnalysisHero } from '@/lib/analysis-hero';
import type { PublishedArticle } from '@/types';

type HeroArticle = ArticleView<PublishedArticle>;

function Lead({ article, solo }: { article: HeroArticle; solo: boolean }) {
  return (
    <div className={solo ? 'flex gap-4 py-4' : 'flex gap-4 py-4 lg:pr-[var(--space-8)]'}>
      {article.image ? (
        <Link
          href={`/analysis/${article.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="order-last block w-24 shrink-0 self-start sm:order-first sm:w-44"
        >
          <ArticleThumbnail
            image={article.image}
            sizes="(min-width: 1024px) 176px, (min-width: 640px) 192px, 96px"
          />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <ArticleTypeLabel type={article.type} />
        <h3 className="mt-1 line-clamp-3 font-[family-name:var(--font-display)] text-[clamp(1.375rem,1.1rem+0.9vw,1.625rem)] font-normal leading-[1.2] [overflow-wrap:anywhere]">
          <Link href={`/analysis/${article.slug}`} className="hover:text-primary">
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-[0.9375rem] leading-[1.6] text-muted-foreground sm:line-clamp-3">
          {article.summary}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
          <Byline />
          <ArticleDate date={article.publishedAt} />
          {article.sourceUnderReview ? (
            <span className="text-[var(--caution)]">Source under review</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function MoreRow({ article }: { article: HeroArticle }) {
  return (
    <li className="border-b border-[var(--rule-hair)] py-[var(--space-3)] last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <ArticleTypeLabel type={article.type} />
        <p className="font-mono text-[11px] text-muted-foreground">
          <ArticleDate date={article.publishedAt} />
        </p>
      </div>
      <h3 className="mt-1 line-clamp-3 font-[family-name:var(--font-display)] text-[1.0625rem] font-normal leading-[1.3] [overflow-wrap:anywhere]">
        <Link href={`/analysis/${article.slug}`} className="hover:text-primary">
          {article.title}
        </Link>
      </h3>
    </li>
  );
}

export function AnalysisHero({ articles }: { articles: HeroArticle[] }) {
  const hero = selectAnalysisHero(articles);
  if (!hero) return null;
  const { lead, more } = hero;
  return (
    <section aria-labelledby="analysis-hero-heading" className="mb-8">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[var(--tracking-eyebrow)]">
        <h2 id="analysis-hero-heading">Analysis</h2>
        <div className="flex gap-4">
          <Link href="/analysis" className="hover:text-primary">
            All analysis
          </Link>
          <a href="/analysis/feed.xml" aria-label="Analysis feed (Atom)" className="hover:text-primary">
            Analysis feed
          </a>
        </div>
      </div>
      <div className={more.length > 0 ? 'lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : undefined}>
        <Lead article={lead} solo={more.length === 0} />
        {more.length > 0 ? (
          <ul className="hidden border-t border-[var(--rule-hair)] sm:block lg:border-l lg:border-t-0 lg:pl-[var(--space-8)]">
            {more.map((article) => (
              <MoreRow key={article.slug} article={article} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
