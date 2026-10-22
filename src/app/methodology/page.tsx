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
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const METHODOLOGY_TITLE = 'Methodology and verification';
const METHODOLOGY_DESCRIPTION =
  'How Policai discovers, verifies, reviews and publishes Australian AI policy records — and which machine feeds and APIs are available.';

export const metadata: Metadata = {
  title: METHODOLOGY_TITLE,
  description: METHODOLOGY_DESCRIPTION,
  alternates: pageAlternates('/methodology'),
  ...pageSocialMeta({
    title: METHODOLOGY_TITLE,
    description: METHODOLOGY_DESCRIPTION,
    path: '/methodology',
  }),
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
        title="Methodology and verification"
        description="How records are discovered, verified and published."
      />
      <MetricStrip metrics={[
        { value: publicPolicies.length, label: 'public records' },
        { value: withheldCount, label: 'withheld for review' },
        { value: meta.collector.automaticSourceCount, label: 'automatic sources' },
        { value: manualCoverage.total, label: 'manual sources' },
      ]} />

      <div className="grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="max-w-3xl space-y-10 text-sm leading-6">
        <section>
          <h2 id="trust-levels" className="section-title scroll-mt-20">Trust levels</h2>
          <dl className="space-y-4">
            <div className="border-l-2 border-[var(--trust)] bg-[var(--status-active-bg)]/25 px-4 py-3">
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
                A lead detected on an official source and assessed by Claude,
                an Anthropic model, with a keyword-rule fallback when that
                classifier is not enabled. This is a change from earlier
                versions of the collector, which used keyword rules only and
                no external model. Machine confidence is capped at 0.65 in
                every stored and displayed figure, so a radar item never reads
                as more certain than an editor&apos;s review, and it remains
                “Needs review” until editorially checked against the primary
                source.
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-t border-border pt-7">
          <h2 id="source-and-date-rules" className="section-title scroll-mt-20">Source and date rules</h2>
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
          <h2 id="register-state" className="section-title scroll-mt-20">Current register state</h2>
          <p className="text-muted-foreground">
            {publicPolicies.length} records are currently publishable in the
            public register.
            {withheldCount > 0
              ? ` ${withheldCount} additional editorial records are withheld because they are awaiting review or have changed at source. Records past their 90-day review interval stay published and are labelled “Review due”.`
              : ' No non-trashed editorial records are currently withheld.'}
          </p>
        </section>

        <section className="border-t border-border pt-7">
          <h2 id="collection-health" className="section-title scroll-mt-20">Collection health</h2>
          <p className="text-muted-foreground">
            The latest run is <strong>{meta.collector.health}</strong>, with{' '}
            {meta.collector.successfulSourceCount} of{' '}
            {meta.collector.dueSourceCount} due sources successfully checked.
            A run with poor coverage is failed even when the automation process
            itself completed.
          </p>
          <p className="mt-2 text-muted-foreground">
            Per-source detail, including sources whose last completed check is
            overdue, is on the{' '}
            <Link href="/status" className="text-primary underline underline-offset-4 hover:no-underline">
              source status page
            </Link>
            .
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
          <h2 id="machine-feeds" className="section-title scroll-mt-20">
            Machine feeds and API
          </h2>
          <p className="text-muted-foreground">
            Read-only surfaces for feed readers and agents. They use the same
            public projection as the site: verified, non-trashed, non-withheld
            register records, and non-dismissed developments. Response shapes
            stay as they are unless a concrete consumer needs a change.
          </p>
          <h3 className="mt-5 font-medium">Feeds</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              <a
                href="/feed.xml"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /feed.xml
              </a>
              {' '}
              — Atom feed of recent public developments (the same list as{' '}
              <Link
                href="/developments"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                /developments
              </Link>
              ). There is no separate developments-only Atom path; this is that
              feed.
            </li>
            <li>
              <a
                href="/analysis/feed.xml"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /analysis/feed.xml
              </a>
              {' '}
              — Atom feed of published analysis pieces.
            </li>
          </ul>
          <h3 className="mt-5 font-medium">JSON and markdown</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              <Link
                href="/api/policies"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/policies
              </Link>
              {' '}
              — search the public register;{' '}
              <span className="font-mono text-xs">/api/policies/&#123;id&#125;</span>{' '}
              returns one record.
            </li>
            <li>
              <span className="font-mono text-xs">
                /api/policies/&#123;id&#125;/markdown
              </span>
              {' '}
              — one public record as{' '}
              <span className="font-mono text-xs">text/markdown</span> with
              source URL, verification and review stamps. Linked from each
              policy page.
            </li>
            <li>
              <a
                href="/api/developments"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/developments
              </a>
              {' '}
              — search public developments (JSON; filters for jurisdiction,
              status, since, and limit).
            </li>
            <li>
              <a
                href="/api/status"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/status
              </a>
              {' '}
              — collection health and freshness; the human page is{' '}
              <Link
                href="/status"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                /status
              </Link>
              .
            </li>
            <li>
              Also public and read-only:{' '}
              <a
                href="/api/timeline"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/timeline
              </a>
              ,{' '}
              <a
                href="/api/agencies"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/agencies
              </a>
              ,{' '}
              <a
                href="/api/network"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/network
              </a>
              , and{' '}
              <a
                href="/api/court-requirements"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/court-requirements
              </a>
              .
            </li>
          </ul>
          <p className="mt-4 text-muted-foreground">
            Endpoint filters and response forms are described in the repository
            file{' '}
            <a
              href="https://github.com/l0cka/policai/blob/main/docs/api.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              docs/api.md
            </a>
            .
          </p>
        </section>

        <section className="border-t border-border pt-7">
          <h2 id="open-data" className="section-title scroll-mt-20">Open data and corrections</h2>
          <p className="text-muted-foreground">
            Canonical records are versioned in Git and available as{' '}
            <a
              href="/data/policies.json"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              open JSON
            </a>
            . Feeds and the JSON API are listed under{' '}
            <a
              href="#machine-feeds"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              Machine feeds and API
            </a>
            . Corrections can be proposed through{' '}
            <a
              href="https://github.com/l0cka/policai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              GitHub
            </a>
            . Return to the{' '}
            <Link href="/" className="text-primary underline underline-offset-4 hover:no-underline">
              policy register
            </Link>
            .
          </p>
        </section>
      </div>
        <nav aria-label="On this page" className="hidden self-start border-l border-border pl-6 text-sm lg:sticky lg:top-20 lg:block">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">On this page</p>
          <ul className="mt-3">
            <li><a href="#trust-levels" className="block py-1 text-muted-foreground hover:text-primary">Trust levels</a></li>
            <li><a href="#source-and-date-rules" className="block py-1 text-muted-foreground hover:text-primary">Source and date rules</a></li>
            <li><a href="#register-state" className="block py-1 text-muted-foreground hover:text-primary">Current register state</a></li>
            <li><a href="#collection-health" className="block py-1 text-muted-foreground hover:text-primary">Collection health</a></li>
            <li><a href="#machine-feeds" className="block py-1 text-muted-foreground hover:text-primary">Machine feeds and API</a></li>
            <li><a href="#open-data" className="block py-1 text-muted-foreground hover:text-primary">Open data and corrections</a></li>
          </ul>
        </nav>
      </div>
    </article>
  );
}
