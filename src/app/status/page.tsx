import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getCollectionMeta,
  getPolicies,
  getSourceCheckTimes,
  getSourceMonitoring,
  getSourceReviews,
} from '@/lib/data-service';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';
import {
  assessSourceFreshness,
  FRESHNESS_LIMIT_DAYS,
  summarizeSourceFreshness,
  type SourceFreshnessState,
} from '@/lib/source-freshness';
import {
  buildJurisdictionCoverage,
  summarizeReviewQueue,
} from '@/lib/coverage-report';
import { MetricStrip, PageIntro } from '@/components/layout';
import { HealthSignal } from '@/components/ui/health-signal';
import { getJurisdictionName } from '@/types';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Source status - Policai',
  description:
    'Which official sources Policai watches, when each was last checked, and where the register is thin.',
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

function age(days: number | null): string {
  if (days === null) return '—';
  return days === 1 ? '1 day' : `${days} days`;
}

export default async function StatusPage() {
  const [meta, policies, checkTimes, monitoring, pendingReviews] =
    await Promise.all([
      getCollectionMeta(),
      getPolicies(),
      getSourceCheckTimes(),
      getSourceMonitoring(),
      getSourceReviews({ status: 'pending_review' }),
    ]);
  const rows = assessSourceFreshness(WATCH_SOURCES, checkTimes);
  const freshness = summarizeSourceFreshness(rows);
  const manual = summarizeManualSourceCoverage(WATCH_SOURCES, monitoring);
  const queue = summarizeReviewQueue(pendingReviews);
  const jurisdictions = buildJurisdictionCoverage(policies, WATCH_SOURCES);

  return (
    <article className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        eyebrow="Coverage"
        title="Source status"
        description="When each official source was last checked successfully, and where the register is thin."
        actions={<HealthSignal health={meta.collector.health} />}
      />
      <MetricStrip
        metrics={[
          {
            value: `${meta.collector.successfulSourceCount}/${meta.collector.dueSourceCount}`,
            label: 'due sources reached, last run',
          },
          { value: freshness.overdue, label: 'overdue sources' },
          { value: freshness.neverChecked, label: 'never checked' },
          { value: queue.pending, label: 'awaiting review' },
        ]}
      />

      <div className="max-w-5xl space-y-10 py-9 text-sm leading-6">
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
          <h2 className="section-title">Sources</h2>
          <p className="mb-3 text-muted-foreground">
            A source is overdue when its last completed check is older than{' '}
            {FRESHNESS_LIMIT_DAYS.daily} days (daily sources) or{' '}
            {FRESHNESS_LIMIT_DAYS.weekly} days (weekly sources). A run can
            reach a source without completing its check, for example while a
            changed document waits for editorial review. This table can
            therefore disagree with the last-run figure above.
          </p>
          <div className="overflow-x-auto">
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
          <div className="overflow-x-auto">
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

        <p className="text-muted-foreground">
          Machine-readable:{' '}
          <a href="/api/status" className="text-primary hover:underline">
            /api/status
          </a>
          . How sources are chosen and verified:{' '}
          <Link href="/methodology" className="text-primary hover:underline">
            methodology
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
