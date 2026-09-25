'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Filter,
  Search,
} from 'lucide-react';
import { HealthSignal } from '@/components/ui/health-signal';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import { formatPolicyDate } from '@/lib/format-policy-date';
import {
  JURISDICTION_NAMES,
  getJurisdictionName,
  type CollectionHealthStatus,
  type Development,
} from '@/types';
import { cn } from '@/lib/utils';
import {
  DEVELOPMENT_STREAMS,
  getDevelopmentStreamName,
  type DevelopmentStream,
} from '@/lib/development-streams';

interface DevelopmentsBrowserProps {
  developments: Development[];
  /** Reader stream per development id, derived on the server. */
  streamById: Record<string, DevelopmentStream>;
  collectionHealth: CollectionHealthStatus;
  lastCollectedAt: string | null;
  successfulSourceCount: number;
  dueSourceCount: number;
  automaticSourceCount: number;
  manualSourceCount: number;
  currentManualSourceCount: number;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function developmentDate(development: Development): string {
  if (!development.publishedAt) return formatDate(development.detectedAt);
  return formatPolicyDate(
    {
      type: 'published',
      date: development.publishedAt,
      precision: development.publishedAtPrecision ?? 'day',
    },
    { short: true },
  );
}

function monthKey(development: Development): string {
  return new Date(development.publishedAt || development.detectedAt)
    .toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

function eventType(development: Development): string {
  const title = development.title.toLowerCase();
  if (title.includes('consult')) return 'Consultation';
  if (title.includes('release') || title.includes('publish')) return 'New';
  if (title.includes('update') || title.includes('amend')) return 'Update';
  return development.classification === 'heuristic' ? 'Radar' : 'Development';
}

function DevelopmentFeed({
  items,
  onReset,
}: {
  items: Development[];
  onReset?: () => void;
}) {
  const grouped = new Map<string, Development[]>();
  for (const development of items) {
    const key = monthKey(development);
    grouped.set(key, [...(grouped.get(key) ?? []), development]);
  }

  if (items.length === 0) {
    return (
      <div role="status" className="border-y border-border py-14 text-center">
        <p className="section-title">No matching developments</p>
        <p className="mt-2 text-sm text-muted-foreground">Try a broader search or jurisdiction.</p>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="mt-4 min-h-11 border border-primary px-4 text-sm text-primary hover:bg-accent"
          >
            Clear search and filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {Array.from(grouped.entries()).map(([month, developments]) => (
        <section key={month} className="mb-4">
          <h2 className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">{month}</h2>
          <div>
            {developments.map((development) => {
              const verified = development.verification.status === 'verified';
              const label = eventType(development);
              return (
                <article
                  key={development.id}
                  style={jurisdictionRailStyle(development.jurisdiction)}
                  className="ink-rail grid gap-2 border-b border-border py-4 pl-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)] sm:grid-cols-[6.5rem_7rem_minmax(0,1fr)] lg:grid-cols-[6.5rem_7rem_minmax(0,1fr)_9rem_10rem]"
                >
                  <time className="text-xs font-medium text-muted-foreground tabular">{developmentDate(development)}</time>
                  <div>
                    <span className={cn('inline-flex rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]', label === 'Consultation' || !verified ? 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]' : 'bg-[var(--status-active-bg)] text-[var(--trust)]')}>
                      {label}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <a href={development.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1.5 record-title hover:text-primary">
                      {development.title}
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
                    </a>
                    {development.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{development.summary}</p> : null}
                    <p className="mt-2 text-[11px] text-muted-foreground lg:hidden">{getJurisdictionName(development.jurisdiction)} · {development.sourceName}</p>
                  </div>
                  <div className="hidden text-xs leading-5 text-muted-foreground lg:block">{getJurisdictionName(development.jurisdiction)}</div>
                  <div className="hidden lg:block">
                    <p className="text-xs text-muted-foreground">{development.sourceName}</p>
                    <p className={cn('mt-2 flex items-center gap-1.5 text-[11px]', verified ? 'text-[var(--trust)]' : 'text-[var(--caution)]')}>
                      {verified ? <CheckCircle2 className="h-3.5 w-3.5" fill="currentColor" /> : <CircleAlert className="h-3.5 w-3.5" />}
                      {verified ? 'Verified' : 'Needs review'}
                    </p>
                    {development.relatedPolicyId ? (
                      <Link href={`/policies/${development.relatedPolicyId}`} className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">In the register <ArrowRight className="h-3 w-3" /></Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DevelopmentsBrowser({
  developments,
  streamById,
  collectionHealth,
  lastCollectedAt,
  successfulSourceCount,
  dueSourceCount,
  automaticSourceCount,
  manualSourceCount,
  currentManualSourceCount,
}: DevelopmentsBrowserProps) {
  const [activeTab, setActiveTab] = useState<'verified' | 'radar'>(() =>
    developments.some((item) => item.verification.status === 'verified')
      ? 'verified'
      : 'radar',
  );
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [jurisdiction, setJurisdiction] = useState('all');
  const [stream, setStream] = useState<'all' | DevelopmentStream>('all');

  const verified = developments.filter((item) => item.verification.status === 'verified');
  const radar = developments.filter((item) => item.verification.status !== 'verified');
  const activeItems = activeTab === 'verified' ? verified : radar;
  const filteredItems = useMemo(
    () =>
      activeItems.filter((item) => {
        const matchesSearch = deferredSearch.length === 0 || item.title.toLowerCase().includes(deferredSearch) || item.summary?.toLowerCase().includes(deferredSearch) || item.sourceName.toLowerCase().includes(deferredSearch);
        const matchesJurisdiction = jurisdiction === 'all' || item.jurisdiction === jurisdiction;
        const matchesStream = stream === 'all' || streamById[item.id] === stream;
        return matchesSearch && matchesJurisdiction && matchesStream;
      }),
    [activeItems, deferredSearch, jurisdiction, stream, streamById],
  );

  const automaticCoverage = dueSourceCount > 0 ? Math.round((successfulSourceCount / dueSourceCount) * 100) : 100;
  const manualCoverage = manualSourceCount > 0 ? Math.round((currentManualSourceCount / manualSourceCount) * 100) : 100;
  const overallCoverage = Math.round((automaticCoverage + manualCoverage) / 2);

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <header className="reveal">
        <h1 className="page-title">Policy developments</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Updates found on official sources. Records an editor has checked are
          listed separately from leads that are still unconfirmed.
        </p>
      </header>

      <div className="mt-5 flex gap-4 border-b border-border sm:gap-8" role="tablist" aria-label="Development verification state">
        <button type="button" role="tab" aria-selected={activeTab === 'verified'} onClick={() => setActiveTab('verified')} className={cn('-mb-px min-h-12 whitespace-nowrap border-b-[3px] px-1 text-base transition-colors sm:min-h-14 sm:px-2 sm:text-lg', activeTab === 'verified' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          Verified<span className="hidden sm:inline"> developments</span> <span className="ml-1.5 font-mono text-sm">{verified.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'radar'} onClick={() => setActiveTab('radar')} className={cn('-mb-px min-h-12 whitespace-nowrap border-b-[3px] px-1 text-base transition-colors sm:min-h-14 sm:px-2 sm:text-lg', activeTab === 'radar' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <span className="sm:hidden">Unconfirmed</span><span className="hidden sm:inline">Automated radar</span> <span className="ml-1.5 font-mono text-sm">{radar.length}</span>
        </button>
      </div>

      <p className={cn('flex min-h-11 items-center gap-2 border-b border-border px-3 text-xs', activeTab === 'verified' ? 'bg-[var(--status-active-bg)]/35' : 'bg-[var(--status-proposed-bg)]/45')}>
        {activeTab === 'verified' ? <CheckCircle2 className="h-4 w-4 text-[var(--trust)]" fill="currentColor" /> : <CircleAlert className="h-4 w-4 text-[var(--caution)]" />}
        {activeTab === 'verified' ? 'Checked against the linked official source.' : 'Detected automatically and not yet editorially verified.'}
      </p>

      <div className="mt-3 grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search developments</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search developments" className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus:border-primary" />
            </label>
            <label className="relative sm:w-60">
              <span className="sr-only">Filter by jurisdiction</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} className="h-11 w-full rounded-md appearance-none border border-input bg-background pl-10 pr-3 text-sm">
                <option value="all">All jurisdictions</option>
                {Object.entries(JURISDICTION_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="relative sm:w-60">
              <span className="sr-only">Filter by stream</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <select value={stream} onChange={(event) => setStream(event.target.value as 'all' | DevelopmentStream)} className="h-11 w-full rounded-md appearance-none border border-input bg-background pl-10 pr-3 text-sm">
                <option value="all">All streams</option>
                {DEVELOPMENT_STREAMS.map((value) => <option key={value} value={value}>{getDevelopmentStreamName(value)}</option>)}
              </select>
            </label>
          </div>
          <DevelopmentFeed
            items={filteredItems}
            onReset={
              search || jurisdiction !== 'all' || stream !== 'all'
                ? () => {
                    setSearch('');
                    setJurisdiction('all');
                    setStream('all');
                  }
                : undefined
            }
          />
        </div>

        <aside className="self-start border-border xl:sticky xl:top-28 xl:border-l xl:pl-6">
          <section>
            <h2 className="text-sm font-semibold">Collection status</h2>
            <div className="mt-3 rounded-md border border-border bg-card/50 p-4">
              <HealthSignal health={collectionHealth} className="text-[12px]" />
              {lastCollectedAt ? <p className="mt-3 border-t border-border pt-3 font-mono text-[11px] uppercase text-muted-foreground">Last checked {formatDate(lastCollectedAt)}</p> : null}
            </div>
            <div className="mt-4 space-y-3">
              {[
                ['Automatic', automaticCoverage],
                ['Manual', manualCoverage],
                ['Overall', overallCoverage],
              ].map(([label, value]) => (
                <div key={label as string} className="grid grid-cols-[5rem_1fr_2.25rem] items-center gap-2 text-xs">
                  <span>{label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[var(--trust)]" style={{ width: `${value}%` }} /></span>
                  <span className="font-mono text-[11px] font-medium text-muted-foreground">{value}%</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] uppercase leading-4 text-muted-foreground">{automaticSourceCount} automatic · {manualSourceCount} manual sources</p>
            <Link href="/methodology" className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline">View methodology <ArrowRight className="h-3 w-3" /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
