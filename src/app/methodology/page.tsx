import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getCollectionMeta,
  getPolicies,
  getSourceMonitoring,
} from '@/lib/data-service';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';
import { MetricStrip, PageIntro } from '@/components/layout';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Methodology & Verification — Policai',
  description:
    'How Policai discovers, verifies, reviews, and publishes Australian AI policy information.',
};

export default async function MethodologyPage() {
  const [publicPolicies, editorialPolicies, meta, monitoring] =
    await Promise.all([
      getPolicies(),
      getPolicies(undefined, { access: 'admin' }),
      getCollectionMeta(),
      getSourceMonitoring(),
    ]);
  const manualCoverage = summarizeManualSourceCoverage(
    WATCH_SOURCES,
    monitoring,
  );
  const editorialRegisterCount = editorialPolicies.filter(
    (policy) => policy.status !== 'trashed',
  ).length;
  const withheldCount = Math.max(
    0,
    editorialRegisterCount - publicPolicies.length,
  );

  return (
    <article className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Methodology & verification"
        description={
          <p>
          Policai separates automated discovery from editorial verification.
          The policy register is source-backed; the developments radar can
          contain unverified leads and labels them accordingly.
          </p>
        }
      />
      <MetricStrip metrics={[
        { value: publicPolicies.length, label: 'public records' },
        { value: withheldCount, label: 'withheld for review' },
        { value: meta.collector.automaticSourceCount, label: 'automatic sources' },
        { value: manualCoverage.total, label: 'manual sources' },
      ]} />

      <div className="mx-auto max-w-4xl space-y-10 py-9 text-sm leading-6">
        <section>
          <h2 className="font-display text-3xl">Trust levels</h2>
          <dl className="space-y-4">
            <div className="mt-4 border-l-2 border-[var(--trust)] bg-[var(--status-active-bg)]/25 px-4 py-3">
              <dt className="font-medium">Verified register record</dt>
              <dd className="text-muted-foreground">
                Title, jurisdiction, issuer, type, status, displayed date, and
                summary checked against an official primary source by an
                editor.
              </dd>
            </div>
            <div className="border-l-2 border-[var(--caution)] bg-[var(--status-proposed-bg)]/30 px-4 py-3">
              <dt className="font-medium">Automated radar item</dt>
              <dd className="text-muted-foreground">
                A lead detected on an official source and assessed by a model or
                keyword rules. It remains “Needs review” until editorially
                checked.
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="font-display text-3xl">Source and date rules</h2>
          <ul className="list-disc pl-5 text-muted-foreground space-y-2">
            <li>
              Verified records use the official instrument page or document.
            </li>
            <li>
              News pages, feeds, and sitemaps are discovery sources, not final
              authority.
            </li>
            <li>
              Discovery time is never substituted for an unknown publication
              or effective date.
            </li>
            <li>
              Machine confidence is relevance evidence, not a verification
              score.
            </li>
          </ul>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="font-display text-3xl">Current register state</h2>
          <p className="text-muted-foreground">
            {publicPolicies.length} records are currently publishable in the
            public register.
            {withheldCount > 0
              ? ` ${withheldCount} additional editorial records are withheld because they are awaiting review, have changed at source, or their verification has expired.`
              : ' No non-trashed editorial records are currently withheld.'}
          </p>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="font-display text-3xl">Collection health</h2>
          <p className="text-muted-foreground">
            The latest run is <strong>{meta.collector.health}</strong>, with{' '}
            {meta.collector.successfulSourceCount} of{' '}
            {meta.collector.dueSourceCount} due sources successfully checked.
            A run with poor coverage is failed even when the automation process
            itself completed.
          </p>
          <p className="mt-2 text-muted-foreground">
            The catalogue contains {meta.collector.automaticSourceCount}{' '}
            automatic sources and {manualCoverage.total} sources requiring an
            explicit browser-based review because their publishers block
            reliable automation. {manualCoverage.current} of those manual
            sources have been successfully checked within their review cadence
            {manualCoverage.unavailable > 0
              ? `; ${manualCoverage.unavailable} are currently recorded as unavailable.`
              : '.'}
          </p>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="font-display text-3xl">Open data and corrections</h2>
          <p className="text-muted-foreground">
            Canonical records are versioned in Git and available as{' '}
            <a
              href="/data/policies.json"
              className="text-primary hover:underline"
            >
              open JSON
            </a>
            . Corrections can be proposed through{' '}
            <a
              href="https://github.com/l0cka/policai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              GitHub
            </a>
            . Return to the{' '}
            <Link href="/" className="text-primary hover:underline">
              policy register
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
