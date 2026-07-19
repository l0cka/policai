import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import {
  getCollectionMeta,
  getDevelopments,
  getSourceMonitoring,
} from '@/lib/data-service';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';
import {
  getJurisdictionName,
  type Development,
  type VerificationStatus,
} from '@/types';
import { formatPolicyDate } from '@/lib/format-policy-date';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Developments — Policai',
  description:
    'Verified and emerging Australian AI policy developments from official government sources.',
};

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: 'Verified',
  needs_review: 'Needs review',
  stale: 'Stale',
  source_unavailable: 'Source unavailable',
};

const METHOD_LABELS: Record<Development['classification'], string> = {
  curated: 'Editorial assessment',
  ai: 'AI assessment',
  heuristic: 'Keyword assessment',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDevelopmentDate(development: Development): string {
  if (!development.publishedAt) {
    return formatDate(development.detectedAt);
  }
  return formatPolicyDate(
    {
      type: 'published',
      date: development.publishedAt,
      precision: development.publishedAtPrecision ?? 'day',
    },
    { short: true },
  );
}

function monthKey(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });
}

function DevelopmentGroups({ items }: { items: Development[] }) {
  const byMonth = new Map<string, Development[]>();
  for (const development of items) {
    const key = monthKey(development.publishedAt || development.detectedAt);
    const bucket = byMonth.get(key) ?? [];
    bucket.push(development);
    byMonth.set(key, bucket);
  }

  return (
    <div className="space-y-10">
      {Array.from(byMonth.entries()).map(([month, developments]) => (
        <section key={month} aria-label={month}>
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2 mb-4">
            {month}
          </h3>
          <ul className="space-y-5">
            {developments.map((development) => (
              <li key={development.id} className="group">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-muted-foreground whitespace-nowrap w-20 shrink-0">
                    {formatDevelopmentDate(development)}
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
                      <span>
                        {getJurisdictionName(development.jurisdiction)}
                      </span>
                      <span>{development.sourceName}</span>
                      <span
                        className={
                          development.verification.status === 'verified'
                            ? 'text-[var(--status-active)]'
                            : 'text-[var(--status-proposed)]'
                        }
                      >
                        {
                          VERIFICATION_LABELS[
                            development.verification.status
                          ]
                        }
                      </span>
                      <span
                        title={
                          development.assessment.model
                            ? `${development.assessment.provider ?? 'AI'} / ${development.assessment.model}`
                            : development.assessment.promptVersion
                        }
                      >
                        {METHOD_LABELS[development.classification]}
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
  );
}

export default async function DevelopmentsPage() {
  const [developments, meta, monitoring] = await Promise.all([
    getDevelopments(),
    getCollectionMeta(),
    getSourceMonitoring(),
  ]);
  const manualCoverage = summarizeManualSourceCoverage(
    WATCH_SOURCES,
    monitoring,
  );
  const visible = developments.filter(
    (development) => development.status !== 'dismissed',
  );
  const verified = visible.filter(
    (development) => development.verification.status === 'verified',
  );
  const radar = visible.filter(
    (development) => development.verification.status !== 'verified',
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Developments
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Official-source Australian AI policy activity. Verified items have
          been checked editorially. The radar is a discovery aid and must not be
          treated as verified until it joins the{' '}
          <Link href="/" className="text-primary hover:underline">
            policy register
          </Link>
          .
        </p>
        {meta.lastCollectedAt && (
          <div className="mt-4 border-l-2 border-border pl-3 text-xs text-muted-foreground">
            <p>
              Collection last attempted {formatDate(meta.lastCollectedAt)}.
            </p>
            <p>
              Coverage: {meta.collector.successfulSourceCount}/
              {meta.collector.dueSourceCount} due sources successful —{' '}
              <span className="font-medium">{meta.collector.health}</span>.
            </p>
            <p>
              Manual coverage: {manualCoverage.current}/{manualCoverage.total}{' '}
              sources successfully checked on schedule
              {manualCoverage.unavailable > 0
                ? `; ${manualCoverage.unavailable} currently unavailable.`
                : '.'}
            </p>
          </div>
        )}
      </header>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-2">Verified developments</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Checked against the linked official source.
        </p>
        {verified.length > 0 ? (
          <DevelopmentGroups items={verified} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No verified developments are currently published.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Automated radar</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Unverified leads detected on official sources. Assessment method is
          shown for transparency; model or keyword confidence is not
          verification.
        </p>
        {radar.length > 0 ? (
          <DevelopmentGroups items={radar} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No unverified developments are awaiting review.
          </p>
        )}
      </section>
    </div>
  );
}
