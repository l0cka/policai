import Link from 'next/link';
import { AnalysisTierLabel, ArticleDate } from '@/components/analysis';
import type { CourtAnalysisLink } from '@/lib/court-cross-links';

/** Server-rendered analysis rail for /courts (keeps fs-backed article helpers off the client). */
export function CourtsAnalysis({ articles }: { articles: CourtAnalysisLink[] }) {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby="court-analysis" className="mt-7 max-w-[44rem]">
      <h2
        id="court-analysis"
        className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]"
      >
        Court-focused analysis
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
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {article.summary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <ArticleDate label="Published" date={article.publishedAt} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
