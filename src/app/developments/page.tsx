import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getCollectionMeta, getDevelopments } from '@/lib/data-service';
import { getJurisdictionName, type Development } from '@/types';

export const metadata: Metadata = {
  title: 'Developments — Policai',
  description:
    'Latest Australian AI policy developments, automatically detected from official government sources and curated by Policai.',
};

const CLASSIFICATION_LABELS: Record<Development['classification'], string> = {
  curated: 'Verified',
  ai: 'AI-classified',
  heuristic: 'Needs review',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function monthKey(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });
}

export default async function DevelopmentsPage() {
  const [developments, meta] = await Promise.all([
    getDevelopments(),
    getCollectionMeta(),
  ]);

  const visible = developments.filter(
    (development) => development.status !== 'dismissed',
  );

  const byMonth = new Map<string, Development[]>();
  for (const development of visible) {
    const key = monthKey(development.publishedAt || development.detectedAt);
    const bucket = byMonth.get(key) ?? [];
    bucket.push(development);
    byMonth.set(key, bucket);
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Developments</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          New Australian AI policy activity, detected automatically from official
          government sources every day and reviewed before joining the{' '}
          <Link href="/" className="text-primary hover:underline">
            policy register
          </Link>
          . Items marked &ldquo;Needs review&rdquo; were detected without AI
          verification and may be reclassified.
        </p>
        {meta.lastCollectedAt && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Sources last checked {formatDate(meta.lastCollectedAt)}
          </p>
        )}
      </header>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No developments recorded yet. The collector runs daily; new detections
          will appear here.
        </p>
      ) : (
        <div className="space-y-10">
          {Array.from(byMonth.entries()).map(([month, items]) => (
            <section key={month} aria-label={month}>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2 mb-4">
                {month}
              </h2>
              <ul className="space-y-5">
                {items.map((development) => (
                  <li key={development.id} className="group">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap w-20 shrink-0">
                        {formatDate(development.publishedAt || development.detectedAt)}
                      </span>
                      <div className="min-w-0">
                        <a
                          href={development.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1 text-sm font-medium hover:text-primary transition-colors"
                        >
                          {development.title}
                          <ArrowUpRight className="h-3 w-3 mt-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                        </a>
                        {development.summary && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {development.summary}
                          </p>
                        )}
                        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/80 flex flex-wrap gap-x-3">
                          <span>{getJurisdictionName(development.jurisdiction)}</span>
                          <span>{development.sourceName}</span>
                          <span
                            title={
                              development.classification === 'curated'
                                ? 'Manually verified against the source'
                                : development.classification === 'ai'
                                  ? `AI relevance score ${development.relevanceScore}`
                                  : 'Keyword match only — not yet verified'
                            }
                          >
                            {CLASSIFICATION_LABELS[development.classification]}
                          </span>
                          {development.relatedPolicyId && (
                            <Link
                              href={`/policies/${development.relatedPolicyId}`}
                              className="text-primary hover:underline"
                            >
                              In the register →
                            </Link>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
