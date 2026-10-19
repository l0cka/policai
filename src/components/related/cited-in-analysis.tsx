import Link from 'next/link';
import { AnalysisTierLabel, ArticleDate } from '@/components/analysis';
import type { ArticleType } from '@/types';

export type CitingArticle = {
  slug: string;
  title: string;
  type: ArticleType;
  publishedAt: string;
};

/**
 * Published analysis pieces that cite this register id.
 * Always renders: a quiet one-line empty state when none, no fake suggestions.
 */
export function CitedInAnalysis({ articles }: { articles: CitingArticle[] }) {
  return (
    <section aria-labelledby="cited-in-analysis" className="mt-8 max-w-[44rem]">
      <h2 id="cited-in-analysis" className="mb-3 font-display text-[1.125rem] leading-snug">
        Analysis citing this record
      </h2>
      {articles.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          No published analysis cites this record yet.
        </p>
      ) : (
        <ul>
          {articles.map((article) => (
            <li key={article.slug} className="border-b border-border py-4 last:border-b-0">
              <AnalysisTierLabel type={article.type} />
              <Link
                href={`/analysis/${article.slug}`}
                className="mt-1 inline-block font-display text-base leading-snug hover:text-primary"
              >
                {article.title}
              </Link>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <ArticleDate label="Published" date={article.publishedAt} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
