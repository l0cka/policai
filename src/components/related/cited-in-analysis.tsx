import Link from 'next/link';
import { AnalysisTierLabel, ArticleDate } from '@/components/analysis';
import type { ArticleType } from '@/types';

export interface CitingAnalysisLink {
  slug: string;
  title: string;
  type: ArticleType;
  publishedAt: string;
}

export function CitedInAnalysis({
  articles,
  headingId = 'cited-in-analysis',
  className = 'mt-10',
}: {
  articles: CitingAnalysisLink[];
  headingId?: string;
  className?: string;
}) {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2
        id={headingId}
        className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]"
      >
        Analysis citing this record
      </h2>
      <ul>
        {articles.map((article) => (
          <li key={article.slug} className="border-b border-border py-4">
            <AnalysisTierLabel type={article.type} />
            <Link
              href={`/analysis/${article.slug}`}
              className="record-title mt-1 inline-block hover:text-primary"
            >
              {article.title}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              <ArticleDate label="Published" date={article.publishedAt} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
