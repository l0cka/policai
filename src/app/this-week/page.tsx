import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, CalendarClock } from 'lucide-react';
import {
  getCollectionMeta,
  getDevelopments,
  getPolicies,
} from '@/lib/data-service';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import {
  selectUpcomingPolicyDates,
  selectWeeklyDevelopments,
  weekWindowEndingAt,
  weeklyEvidenceLabel,
  WEEK_MS,
} from '@/lib/this-week';
import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyStatusName,
  getPolicyTypeName,
  type Development,
} from '@/types';
import type { UpcomingPolicyDate as UpcomingDate } from '@/lib/this-week';
import { cn } from '@/lib/utils';

// Upcoming dates must advance even when collection is stalled.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'This week - Policai',
  description:
    'Verified Australian AI policy developments from the latest collected week, and upcoming dates already recorded in the register.',
};

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
    timeZoneName: 'short',
  });
}

function EvidenceLabel({ development }: { development: Development }) {
  const label = weeklyEvidenceLabel(development);
  const direct = label === 'Direct source change';
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]',
        direct
          ? 'bg-[var(--status-active-bg)] text-[var(--trust)]'
          : 'bg-[var(--status-proposed-bg)] text-[var(--caution)]',
      )}
    >
      {label}
    </span>
  );
}

function DevelopmentRow({ development }: { development: Development }) {
  return (
    <article
      style={jurisdictionRailStyle(development.jurisdiction)}
      className="ink-rail grid gap-2 border-b border-border py-4 pl-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)] sm:grid-cols-[7rem_minmax(0,1fr)]"
    >
      <time dateTime={new Date(development.detectedAt).toISOString()} className="font-mono text-[11px] font-medium uppercase text-muted-foreground">
        {new Date(development.detectedAt).toLocaleDateString('en-AU', {
          day: '2-digit',
          month: 'short',
          timeZone: 'Australia/Sydney',
        })}
      </time>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceLabel development={development} />
          <span className="text-[11px] text-muted-foreground">
            {getJurisdictionName(development.jurisdiction)} ·{' '}
            {development.sourceName}
          </span>
        </div>
        <a
          href={development.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-1 inline-flex items-start gap-1.5 text-sm font-semibold leading-5 hover:text-primary"
        >
          {development.title}
          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
        </a>
        {development.summary ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {development.summary}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <span
            className={cn(
              'flex items-center gap-1.5',
              development.verification.status === 'verified'
                ? 'text-[var(--trust)]'
                : 'text-[var(--caution)]',
            )}
          >
            {development.verification.status === 'verified'
              ? 'Verified against the linked official source'
              : 'Needs review'}
          </span>
          {development.relatedPolicyId ? (
            <Link
              href={`/policies/${development.relatedPolicyId}`}
              className="text-primary hover:underline"
            >
              Detail page
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function UpcomingRow({ item }: { item: UpcomingDate }) {
  return (
    <article
      style={jurisdictionRailStyle(item.jurisdiction)}
      className="ink-rail grid gap-2 border-b border-border py-4 pl-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)] sm:grid-cols-[8rem_minmax(0,1fr)]"
    >
      <div className="font-mono text-[11px] font-medium uppercase text-muted-foreground">
        <CalendarClock className="mb-1 h-3.5 w-3.5" />
        <time dateTime={item.date.slice(0, item.precision === 'year' ? 4 : item.precision === 'month' ? 7 : 10)}>
          {formatPolicyDate(
            {
              type: item.dateType,
              date: item.date,
              precision: item.precision,
            },
            { short: true },
          )}
        </time>
        {item.precision !== 'day' ? <p className="mt-1 normal-case">Exact day not recorded</p> : null}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">
          {getPolicyDateTypeName(item.dateType)} ·{' '}
          {getJurisdictionName(item.jurisdiction)} ·{' '}
          {getPolicyTypeName(item.type)} ·{' '}
          {getPolicyStatusName(item.status)}
        </p>
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-1 inline-flex items-start gap-1.5 text-sm font-semibold leading-5 hover:text-primary"
        >
          {item.policyTitle}
          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
        </a>
        <div className="mt-2 text-[11px]">
          <Link
            href={`/policies/${item.policyId}`}
            className="text-primary hover:underline"
          >
            Detail page
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function ThisWeekPage() {
  const [policies, allDevelopments, meta] = await Promise.all([
    getPolicies(),
    getDevelopments(),
    getCollectionMeta(),
  ]);

  // Retrospective coverage follows collection. Coming up uses today's date.
  const now = new Date();
  const anchor = meta.lastHealthyAt ?? meta.lastCollectedAt;
  const window = weekWindowEndingAt(anchor);
  const weeklyDevelopments = window
    ? selectWeeklyDevelopments(allDevelopments, window)
    : [];
  const upcoming = selectUpcomingPolicyDates(policies, weekWindowEndingAt(now)!);
  const stale = window && now.getTime() - window.end > WEEK_MS;
  const dateLabel = (stamp: number) => new Date(stamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });

  const lastCollected = formatTimestamp(meta.lastCollectedAt);
  const lastHealthy = formatTimestamp(meta.lastHealthyAt);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="reveal">
        <h1 className="page-title">This week</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Verified developments from the latest collected week, and dates to
          watch in the register. Every entry links to its source. This is an
          index of recorded activity, not an assessment of its legal significance.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 font-mono text-[11px] uppercase text-muted-foreground">
          {lastCollected ? <span>Last collected {lastCollected}</span> : null}
          {lastHealthy ? <span>Last fully healthy {lastHealthy}</span> : null}
        </p>
        {stale ? <p role="status" className="mt-4 border-l-2 border-[var(--caution)] pl-3 text-sm">Collection is more than seven days old. This is a historical snapshot, not current weekly coverage. <Link href="/methodology" className="underline">Check source health</Link>.</p> : null}
      </header>

      <section className="mt-8">
        <h2 className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
          Verified developments
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {window ? `Detected ${dateLabel(window.start)}–${dateLabel(window.end)}, ending at ${formatTimestamp(new Date(window.end).toISOString())}. ` : 'No usable collection timestamp is available. '}
          The window ends at the last fully healthy collection when recorded,
          otherwise the latest collection. Only editorially verified, non-dismissed
          entries appear. Detection does not mean the instrument changed that day.
        </p>
        {weeklyDevelopments.length > 0 ? (
          <div>
            {weeklyDevelopments.map((development) => (
              <DevelopmentRow
                key={development.id}
                development={development}
              />
            ))}
          </div>
        ) : (
          <div className="border-b border-border py-10 text-center">
            <p className="text-sm font-medium">{window ? 'No verified developments in this window' : 'Weekly coverage unavailable'}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Detections are only listed once they pass editorial verification.
              Unverified leads stay in the{' '}
              <Link href="/developments" className="text-primary hover:underline">
                <span className="underline underline-offset-4">developments feed</span>
              </Link>
              .
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Full history in the{' '}
          <Link href="/developments" className="text-primary hover:underline">
            <span className="underline underline-offset-4">developments feed</span>
          </Link>
          .
        </p>
      </section>

      <section className="mt-10">
        <h2 className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
          Coming up
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          From today, {dateLabel(now.getTime())} (Sydney): commencement and consultation
          dates recorded for verified proposed, active or amended instruments.
          Month- and year-only dates remain approximate; an exact day is not implied.
          Check the linked source before acting.
        </p>
        {upcoming.length > 0 ? (
          <div>
            {upcoming.map((item) => (
              <UpcomingRow
                key={`${item.policyId}-${item.dateType}-${item.date}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <div className="border-b border-border py-10 text-center">
            <p className="text-sm font-medium">
              No upcoming dates in the register
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              When a tracked instrument records a future commencement or
              consultation deadline, it appears here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}