import Link from 'next/link';
import {
  ARTICLE_BYLINE,
  ARTICLE_DISCLOSURE,
  ARTICLE_NOTICE,
  ARTICLE_TIER_LABEL,
} from '@/lib/articles';
import { formatPolicyDate } from '@/lib/format-policy-date';
import type { ArticleCitation } from '@/lib/data-service';
import { ARTICLE_TYPE_NAMES, type ArticleType } from '@/types';

export function formatArticleDate(date: string): string {
  return formatPolicyDate({ type: 'published', date, precision: 'day' });
}

export function ArticleDate({ date, label }: { date: string; label?: string }) {
  return (
    <span>
      {label ? `${label} ` : null}
      <time dateTime={date}>{formatArticleDate(date)}</time>
    </span>
  );
}

export function AnalysisTierLabel({ type }: { type: ArticleType }) {
  return (
    <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
      <span className="rounded-md border border-primary/25 bg-[var(--status-amended-bg)] px-2 py-1 font-medium text-[var(--status-amended)]">
        {ARTICLE_TIER_LABEL}
      </span>
      <span className="text-muted-foreground">{ARTICLE_TYPE_NAMES[type]}</span>
    </p>
  );
}

export function Byline() {
  return <span>By {ARTICLE_BYLINE}</span>;
}

export function SourceUnderReviewBanner() {
  return (
    <div
      role="status"
      className="border-l-2 border-[var(--caution)] bg-[var(--status-proposed-bg)] px-4 py-3 text-sm"
    >
      <p className="font-medium text-[var(--caution)]">Source under review</p>
      <p className="mt-1 leading-6">
        A register record this piece cites is being re-checked, or is past its
        review date. An editor will re-read the record and this piece. Until
        then, check the official source before relying on what follows.
      </p>
    </div>
  );
}

export function StandardNotices() {
  return (
    <aside
      aria-label="About this piece"
      className="space-y-2 border-y border-border py-4 text-xs leading-5 text-muted-foreground"
    >
      <p>{ARTICLE_DISCLOSURE}</p>
      <p>{ARTICLE_NOTICE}</p>
    </aside>
  );
}

export function CitedRecords({ citations }: { citations: ArticleCitation[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {citations.map((citation) => (
        <li key={citation.policyId}>
          {citation.state === 'not_public' ? (
            <span className="text-muted-foreground">
              Register record under review
            </span>
          ) : (
            <Link
              href={`/policies/${citation.policyId}`}
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              {citation.title ?? citation.policyId}
            </Link>
          )}
          {citation.state === 'review_due' ? (
            <span className="ml-2 text-xs text-[var(--caution)]">Review due</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
