import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getBodies,
  getCollectionMeta,
  getPolicies,
  getSourceCheckTimes,
  getSourceHealth,
  getSourceMonitoring,
  getSourceReviews,
} from '@/lib/data-service';
import { getAutomaticSources, WATCH_SOURCES } from '@/lib/pipeline/sources';
import { sourcesNotReachedSince } from '@/lib/pipeline/source-health';
import { collectionAnchor } from '@/lib/this-week';
import { watchCoverage } from '@/lib/watch-coverage/report';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';
import {
  assessSourceFreshness,
  FRESHNESS_LIMIT_DAYS,
  summarizeSourceFreshness,
  type SourceFreshnessState,
} from '@/lib/source-freshness';
import {
  buildJurisdictionCoverage,
  buildRecordReviewSchedule,
  EXPECTED_RECORD_FIELDS,
  EXPECTED_RECORD_FIELD_LABELS,
  summarizeRecordCompleteness,
  summarizeRecordFreshness,
  summarizeReviewQueue,
} from '@/lib/coverage-report';
import { MetricStrip, PageIntro } from '@/components/layout';
import { HealthSignal } from '@/components/ui/health-signal';
import { getJurisdictionName } from '@/types';
import { EDITORIAL_REVIEW_INTERVAL_DAYS } from '@/lib/verification';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';
import { auDate } from '@/lib/au-date';

export const revalidate = 3600;

const STATUS_TITLE = 'Source status';
const STATUS_DESCRIPTION =
  'Which official sources Policai watches, when each was last checked, and where the register is thin.';

export const metadata: Metadata = {
  title: STATUS_TITLE,
  description: STATUS_DESCRIPTION,
  alternates: pageAlternates('/status'),
  ...pageSocialMeta({
    title: STATUS_TITLE,
    description: STATUS_DESCRIPTION,
    path: '/status',
  }),
};

const STATE_LABEL: Record<SourceFreshnessState, string> = {
  overdue: 'Overdue',
  never_checked: 'Never checked',
  current: 'Current',
  manual: 'Manual review',
};

const HEADER_CELL =
  'py-2.5 pr-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground';
// Secondary columns drop out on narrow screens so the state stays visible.
const WIDE_ONLY = 'hidden sm:table-cell';

const WATCH_TIERS = ['A', 'B', 'C'] as const;
const GAP_NOTE = { failing: ' (failing)', pending: ' (newly admitted, not yet checked)', uncovered: '' } as const;

/** Records due within this many days are listed under Record review. */
const REVIEW_SOON_DAYS = 30;

function sydneyDate(stamp: string | null): string {
  if (!stamp) return 'never';
  return auDate(new Date(stamp), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function dueLabel(daysLeft: number | null): string {
  if (daysLeft === null) return 'Never reviewed';
  if (daysLeft < 0) return `Overdue ${age(-daysLeft)}`;
  if (daysLeft === 0) return 'Due today';
  return `Due in ${age(daysLeft)}`;
}

function age(days: number | null): string {
  if (days === null) return '—';
  return days === 1 ? '1 day' : `${days} days`;
}

export default async function StatusPage() {
  const [meta, policies, checkTimes, sourceHealth, monitoring, pendingReviews, bodies] =
    await Promise.all([
      getCollectionMeta(),
      getPolicies(),
      getSourceCheckTimes(),
      getSourceHealth(),
      getSourceMonitoring(),
      getSourceReviews({ status: 'pending_review' }),
      getBodies(),
    ]);
  const anchor = collectionAnchor(meta);
  const automatic = getAutomaticSources();
  const nameOf = new Map(automatic.map((source) => [source.id, source.name]));
  const unreached = sourcesNotReachedSince(
    anchor,
    sourceHealth,
    automatic.map((source) => source.id),
  );
  const rows = assessSourceFreshness(WATCH_SOURCES, checkTimes);
  const freshness = summarizeSourceFreshness(rows);
  const manual = summarizeManualSourceCoverage(WATCH_SOURCES, monitoring);
  const queue = summarizeReviewQueue(pendingReviews);
  const jurisdictions = buildJurisdictionCoverage(policies, WATCH_SOURCES);
  const records = summarizeRecordFreshness(policies);
  const reviewSchedule = buildRecordReviewSchedule(policies).filter(
    (row) => row.overdue || (row.daysLeft !== null && row.daysLeft <= REVIEW_SOON_DAYS),
  );
  const completeness = summarizeRecordCompleteness(policies);
  const watch = watchCoverage({
    bodies,
    sources: WATCH_SOURCES,
    sourceHealth,
    checkTimes,
    monitoring,
    sourceResults: meta.collector.sourceResults,
    now: new Date(),
  });
  const watchJurisdictions = [...new Set(watch.cells.map((cell) => cell.jurisdiction))];
  const tierAGaps = watch.gaps.filter((gap) => gap.tier === 'A');
  const otherGaps = watch.gaps.length - tierAGaps.length;

  return (
    <article className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Source status"
        description="When each official source was last checked successfully, and where the register is thin."
        actions={<HealthSignal health={meta.collector.health} />}
      />
      <MetricStrip
        metrics={[
          {
            value: `${meta.collector.successfulSourceCount}/${meta.collector.dueSourceCount}`,
            label: `due sources reached in the run of ${sydneyDate(meta.lastCollectedAt)}`,
          },
          { value: freshness.overdue, label: 'sources overdue for a check today' },
          { value: freshness.neverChecked, label: 'never checked' },
          { value: queue.pending, label: 'awaiting review' },
        ]}
      />

      <div className="space-y-10 py-9 text-sm leading-6 [&_section>p]:max-w-3xl">
        <section>
          <h2 className="section-title">Editorial queue</h2>
          <p className="text-muted-foreground">
            {queue.pending === 1
              ? '1 detection awaiting editorial review'
              : `${queue.pending} detections awaiting editorial review`}
            {queue.oldestAgeDays !== null
              ? `, oldest ${age(queue.oldestAgeDays)}.`
              : '.'}{' '}
            {manual.total > 0
              ? `${manual.current} of ${manual.total} manual ${manual.total === 1 ? 'source' : 'sources'} reviewed within cadence.`
              : null}
          </p>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Record review</h2>
          <p className="text-muted-foreground">
            {records.overdue} of {policies.length} public{' '}
            {policies.length === 1 ? 'record' : 'records'}{' '}
            {records.overdue === 1 ? 'is' : 'are'} due for editorial
            re-verification
            {records.oldestAgeDays !== null
              ? `; oldest review ${age(records.oldestAgeDays)} ago.`
              : '.'}{' '}
            An editor re-checks each record against its official source every{' '}
            {EDITORIAL_REVIEW_INTERVAL_DAYS} days. A record past that point
            stays published and is labelled &ldquo;Review due&rdquo; until it
            is re-checked.
          </p>
          {reviewSchedule.length > 0 ? (
            <div className="mt-4 overflow-x-auto" role="region" aria-label="Records due for re-verification" tabIndex={0}>
              <table className="w-full">
                <thead>
                  <tr className="border-y border-[var(--rule-heavy)]">
                    <th scope="col" className={HEADER_CELL}>Record</th>
                    <th scope="col" className={`${HEADER_CELL} ${WIDE_ONLY}`}>Last verified</th>
                    <th scope="col" className={HEADER_CELL}>Re-check</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewSchedule.map((row) => (
                    <tr key={row.id} className="border-b border-border">
                      <td className="py-2.5 pr-3 align-top">
                        <Link href={`/policies/${row.id}`} className="hover:underline">
                          {row.title}
                        </Link>
                      </td>
                      <td className={`py-2.5 pr-3 align-top font-mono text-xs text-muted-foreground ${WIDE_ONLY}`}>
                        {row.reviewedAt?.slice(0, 10) ?? '—'}
                      </td>
                      <td
                        className={
                          row.overdue
                            ? 'py-2.5 align-top font-medium text-[var(--caution)]'
                            : 'py-2.5 align-top text-muted-foreground'
                        }
                      >
                        {dueLabel(row.daysLeft)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-muted-foreground">
              No record is due for re-verification in the next {REVIEW_SOON_DAYS} days.
            </p>
          )}
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Record completeness</h2>
          <p className="text-muted-foreground">
            {completeness.complete} of {completeness.total} public{' '}
            {completeness.total === 1 ? 'record carries' : 'records carry'}{' '}
            every expected field. Required fields are enforced before
            publication; the fields below are expected but not required. This
            measures the records that exist, not how much Australian AI policy
            the register covers.
          </p>
          <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {EXPECTED_RECORD_FIELDS.map((field) => (
              <div key={field} className="flex justify-between gap-4 border-b border-border py-2">
                <dt>{EXPECTED_RECORD_FIELD_LABELS[field]}</dt>
                <dd className="font-mono text-xs text-muted-foreground">
                  {completeness.missing[field].length === 0
                    ? 'All present'
                    : `${completeness.missing[field].length} missing`}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {meta.collector.robotsUnverified?.length ? (
          <section className="border-t border-border pt-7">
            <h2 className="section-title">Robots unverified</h2>
            <p className="text-muted-foreground">
              robots.txt for these hosts has not been readable for 3 or more
              runs; the collector still paces requests to them.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-xs">
              {meta.collector.robotsUnverified.map((host) => (
                <li key={host}>{host}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Not reached since the last passing run</h2>
          <p className="text-muted-foreground">
            Last collected {sydneyDate(meta.lastCollectedAt)}. Last passing
            run {sydneyDate(anchor)}, which anchors the weekly window.{' '}
            {Object.keys(sourceHealth).length === 0
              ? 'The per-source ledger has no records yet; the next collection builds it.'
              : unreached.length === 0
                ? 'Every automatic source has been reached since then.'
                : 'These automatic sources are failing and have had no successful check since then, so the window may miss what they published.'}
          </p>
          {unreached.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {unreached.map((row) => (
                <li key={row.sourceId}>
                  {nameOf.get(row.sourceId) ?? row.sourceId}{' '}
                  <span className="font-mono text-xs text-muted-foreground">
                    failing since {sydneyDate(row.firstFailureAt)},{' '}
                    {row.consecutiveFailures} run
                    {row.consecutiveFailures === 1 ? '' : 's'}
                    {row.lastFailureClass ? `, ${row.lastFailureClass}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Sources</h2>
          <p className="mb-3 text-muted-foreground">
            A source is overdue when its last completed check is older than{' '}
            {FRESHNESS_LIMIT_DAYS.daily} days (daily sources) or{' '}
            {FRESHNESS_LIMIT_DAYS.weekly} days (weekly sources). A run can
            reach a source without completing its check, for example while a
            changed document waits for editorial review. This table can
            therefore disagree with the last-run figure above.
          </p>
          <div className="overflow-x-auto" role="region" aria-label="Source freshness table" tabIndex={0}>
            <table className="w-full">
              <thead>
                <tr className="border-y border-[var(--rule-heavy)]">
                  <th scope="col" className={HEADER_CELL}>Source</th>
                  <th scope="col" className={`${HEADER_CELL} ${WIDE_ONLY}`}>Jurisdiction</th>
                  <th scope="col" className={`${HEADER_CELL} ${WIDE_ONLY}`}>Cadence</th>
                  <th scope="col" className={HEADER_CELL}>Last completed check</th>
                  <th scope="col" className={HEADER_CELL}>State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sourceId} className="border-b border-border">
                    <td className="py-2.5 pr-3 align-top">
                      <span className="block">{row.name}</span>
                      <code className="text-xs text-muted-foreground">
                        {row.sourceId}
                      </code>
                    </td>
                    <td className={`py-2.5 pr-3 align-top text-muted-foreground ${WIDE_ONLY}`}>
                      {getJurisdictionName(row.jurisdiction)}
                    </td>
                    <td className={`py-2.5 pr-3 align-top text-muted-foreground ${WIDE_ONLY}`}>
                      {row.schedule}
                    </td>
                    <td className="py-2.5 pr-3 align-top text-muted-foreground">
                      {age(row.ageDays)}
                    </td>
                    <td
                      className={
                        row.state === 'overdue' || row.state === 'never_checked'
                          ? 'py-2.5 align-top font-medium text-[var(--caution)]'
                          : 'py-2.5 align-top text-muted-foreground'
                      }
                    >
                      {STATE_LABEL[row.state]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Coverage by jurisdiction</h2>
          <p className="mb-3 text-muted-foreground">
            Counts of public register records and watched sources. This is a
            measure of what Policai tracks, not a measure of how much
            Australian AI policy exists in each jurisdiction.
          </p>
          <div className="overflow-x-auto" role="region" aria-label="Coverage by jurisdiction table" tabIndex={0}>
            <table className="w-full">
              <thead>
                <tr className="border-y border-[var(--rule-heavy)]">
                  <th scope="col" className={HEADER_CELL}>Jurisdiction</th>
                  <th scope="col" className={HEADER_CELL}>Public records</th>
                  <th scope="col" className={HEADER_CELL}>Binding instruments</th>
                  <th scope="col" className={HEADER_CELL}>Automatic sources</th>
                  <th scope="col" className={HEADER_CELL}>Manual sources</th>
                </tr>
              </thead>
              <tbody>
                {jurisdictions.map((row) => (
                  <tr key={row.jurisdiction} className="border-b border-border">
                    <td className="py-2.5 pr-3">
                      {getJurisdictionName(row.jurisdiction)}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.publicRecords}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.bindingRecords}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.automaticSources}</td>
                    <td className="py-2.5 tabular-nums">{row.manualSources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Binding instruments are register records typed as legislation or
            regulation.
          </p>
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Watch coverage by publishing body</h2>
          <p className="mb-3 text-muted-foreground">
            Each cell counts the bodies that have a working automatic source
            or a manual source, out of the bodies in that jurisdiction and
            tier. Tier A is each government&apos;s central, digital or AI and
            drafting bodies, plus the federal policy departments, regulators
            and Parliament.
            {watch.unassessed > 0
              ? ` ${watch.unassessed} of these bodies have no scope decision yet and are counted.`
              : null}
          </p>
          <div className="overflow-x-auto" role="region" aria-label="Watch coverage table" tabIndex={0}>
            <table className="w-full">
              <thead>
                <tr className="border-y border-[var(--rule-heavy)]">
                  <th scope="col" className={HEADER_CELL}>Jurisdiction</th>
                  {WATCH_TIERS.map((tier) => (
                    <th key={tier} scope="col" className={HEADER_CELL}>Tier {tier}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {watchJurisdictions.map((jurisdiction) => (
                  <tr key={jurisdiction} className="border-b border-border">
                    <td className="py-2.5 pr-3">{getJurisdictionName(jurisdiction)}</td>
                    {WATCH_TIERS.map((tier) => {
                      const cell = watch.cells.find(
                        (c) => c.jurisdiction === jurisdiction && c.tier === tier,
                      );
                      return (
                        <td key={tier} className="py-2.5 pr-3 tabular-nums">
                          {cell ? `${cell.automatic + cell.manual} of ${cell.bodies}` : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-muted-foreground">
            {tierAGaps.length === 0
              ? 'Every tier A body has a working source.'
              : `Tier A bodies with no working source: ${tierAGaps
                  .map((gap) => `${gap.name}${GAP_NOTE[gap.coverage]}`)
                  .join(', ')}.`}{' '}
            {otherGaps > 0
              ? `${otherGaps} tier B and C ${otherGaps === 1 ? 'body has' : 'bodies have'} none either.`
              : null}
          </p>
          {watch.undecidedRefusals.length > 0 ? (
            <>
              <h3 className="mt-5 font-medium">Refusals awaiting a decision</h3>
              <ul className="mt-2 space-y-1">
                {watch.undecidedRefusals.map((row) => (
                  <li key={row.sourceId}>
                    {row.sourceId}{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.cls} since {sydneyDate(row.since)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-3 text-muted-foreground">
            <Link
              href="/status/refusals"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              Sites that refuse Policai
            </Link>{' '}
            lists every official site that blocks the collector and how each is
            covered instead.
          </p>
          <p className="mt-3 text-muted-foreground">
            <Link
              href="/status/reuse"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              Reuse terms of official sites
            </Link>{' '}
            records what each watched site’s copyright page permits.
          </p>
          {watch.blocks.length > 0 ? (
            <>
              <h3 className="mt-5 font-medium">Decided blocks</h3>
              <ul className="mt-2 space-y-1">
                {watch.blocks.map((block) => (
                  <li key={block.sourceId}>
                    {block.sourceId}{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      {block.automation.because}, {block.automation.decision} since{' '}
                      {sydneyDate(block.automation.since)}, last reviewed{' '}
                      {sydneyDate(block.lastReviewedAt)}
                      {block.overdue ? ', review overdue' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {watch.skippedLinked.length > 0 ? (
            <>
              <h3 className="mt-5 font-medium">Linked documents not requested</h3>
              <ul className="mt-2 space-y-1">
                {watch.skippedLinked.map((row) => (
                  <li key={`${row.sourceId} ${row.url}`}>
                    {row.sourceId}{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.url}, host decided by {row.decidedBy}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="border-t border-border pt-7">
          <h2 className="section-title">Machine feeds and API</h2>
          <p className="text-muted-foreground">
            Feed readers and agents already hit these public surfaces. Full
            descriptions live on{' '}
            <Link
              href="/methodology#machine-feeds"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              methodology
            </Link>
            .
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              <a
                href="/feed.xml"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /feed.xml
              </a>
              {' '}
              — Atom of recent public developments
            </li>
            <li>
              <a
                href="/analysis/feed.xml"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /analysis/feed.xml
              </a>
              {' '}
              — Atom of published analysis
            </li>
            <li>
              <Link
                href="/api/policies"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/policies
              </Link>
              {' '}
              — public register JSON;{' '}
              <span className="font-mono text-xs">
                /api/policies/&#123;id&#125;/markdown
              </span>{' '}
              for one record as markdown
            </li>
            <li>
              <a
                href="/api/developments"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/developments
              </a>
              {' '}
              — public developments JSON
            </li>
            <li>
              <a
                href="/api/status"
                className="font-mono text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                /api/status
              </a>
              {' '}
              — this page as JSON
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
