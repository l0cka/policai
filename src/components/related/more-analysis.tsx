import Link from 'next/link';
import { ArticleDate, ArticleTypeLabel } from '@/components/analysis';
import type { ArticleType } from '@/types';

export type MoreAnalysisItem = {
  slug: string;
  title: string;
  type: ArticleType;
  publishedAt: string;
  sharedCites: number;
};

export function MoreAnalysis({ articles }: { articles: MoreAnalysisItem[] }) {
  if (articles.length === 0) return null;
  return (
    <section aria-labelledby="more-analysis" className="mt-10">
      <h2 id="more-analysis" className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
        More analysis
      </h2>
      <ul>
        {articles.map((article) => (
          <li key={article.slug} className="border-b border-border py-4 last:border-b-0">
            <ArticleTypeLabel type={article.type} />
            <Link
              href={`/analysis/${article.slug}`}
              className="mt-1 inline-block font-display text-base leading-snug hover:text-primary"
            >
              {article.title}
            </Link>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <ArticleDate label="Published" date={article.publishedAt} />
              {article.sharedCites > 0
                ? ` · Shares ${article.sharedCites === 1 ? 'a cited record' : `${article.sharedCites} cited records`}`
                : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
