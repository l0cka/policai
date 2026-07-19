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
import { formatPolicyDate } from '@/lib/format-policy-date';
import {
  JURISDICTION_NAMES,
  getJurisdictionName,
  type CollectionHealthStatus,
  type Development,
} from '@/types';
import { cn } from '@/lib/utils';

interface DevelopmentsBrowserProps {
  developments: Development[];
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
    day: '2-digit',
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

function DevelopmentFeed({ items }: { items: Development[] }) {
  const grouped = new Map<string, Development[]>();
  for (const development of items) {
    const key = monthKey(development);
    grouped.set(key, [...(grouped.get(key) ?? []), development]);
  }

  if (items.length === 0) {
    return (
      <div className="border-y border-border py-14 text-center">
        <p className="font-display text-2xl">No matching developments</p>
        <p className="mt-2 text-sm text-muted-foreground">Try a broader search or jurisdiction.</p>
      </div>
    );
  }

  return (
    <div>
      {Array.from(grouped.entries()).map(([month, developments]) => (
        <section key={month} className="mb-4">
          <h2 className="border-b border-foreground/55 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">{month}</h2>
          <div>
            {developments.map((development) => {
              const verified = development.verification.status === 'verified';
              const label = eventType(development);
              return (
                <article key={development.id} className="content-auto grid gap-2 border-b border-border py-4 sm:grid-cols-[6.5rem_7rem_minmax(0,1fr)] lg:grid-cols-[6.5rem_7rem_minmax(0,1fr)_9rem_10rem]">
                  <time className="font-mono text-[10px] uppercase text-muted-foreground">{developmentDate(development)}</time>
                  <div>
                    <span className={cn('inline-flex rounded px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]', label === 'Consultation' || !verified ? 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]' : 'bg-[var(--status-active-bg)] text-[var(--trust)]')}>
                      {label}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <a href={development.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1.5 text-sm font-semibold leading-5 hover:text-primary">
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

  const verified = developments.filter((item) => item.verification.status === 'verified');
  const radar = developments.filter((item) => item.verification.status !== 'verified');
  const activeItems = activeTab === 'verified' ? verified : radar;
  const filteredItems = useMemo(
    () =>
      activeItems.filter((item) => {
        const matchesSearch = deferredSearch.length === 0 || item.title.toLowerCase().includes(deferredSearch) || item.summary?.toLowerCase().includes(deferredSearch) || item.sourceName.toLowerCase().includes(deferredSearch);
        const matchesJurisdiction = jurisdiction === 'all' || item.jurisdiction === jurisdiction;
        return matchesSearch && matchesJurisdiction;
      }),
    [activeItems, deferredSearch, jurisdiction],
  );

  const automaticCoverage = dueSourceCount > 0 ? Math.round((successfulSourceCount / dueSourceCount) * 100) : 100;
  const manualCoverage = manualSourceCount > 0 ? Math.round((currentManualSourceCount / manualSourceCount) * 100) : 100;
  const overallCoverage = Math.round((automaticCoverage + manualCoverage) / 2);

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <h1 className="font-display text-[clamp(2.65rem,4vw,4rem)] leading-none tracking-[-0.035em]">Policy developments</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Track updates to AI policies, strategies and frameworks across Australian governments.
          Verified developments are checked against official sources; automated radar items need review.
        </p>
      </header>

      <div className="mt-5 flex gap-8 overflow-x-auto border-b border-border" role="tablist" aria-label="Development verification state">
        <button type="button" role="tab" aria-selected={activeTab === 'verified'} onClick={() => setActiveTab('verified')} className={cn('-mb-px min-h-14 whitespace-nowrap border-b-[3px] px-2 text-lg transition-colors', activeTab === 'verified' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          Verified developments <span className="ml-2 font-mono text-sm">{verified.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'radar'} onClick={() => setActiveTab('radar')} className={cn('-mb-px min-h-14 whitespace-nowrap border-b-[3px] px-2 text-lg transition-colors', activeTab === 'radar' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          Automated radar <span className="ml-2 font-mono text-sm">{radar.length}</span>
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
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search developments" className="h-11 w-full border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <label className="relative sm:w-60">
              <span className="sr-only">Filter by jurisdiction</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} className="h-11 w-full appearance-none border border-input bg-background pl-10 pr-3 text-sm">
                <option value="all">All jurisdictions</option>
                {Object.entries(JURISDICTION_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <DevelopmentFeed items={filteredItems} />
        </div>

        <aside className="border-l border-border pl-6">
          <section>
            <h2 className="text-sm font-semibold">Collection status</h2>
            <div className="mt-3 border border-[var(--trust)]/30 bg-[var(--status-active-bg)]/30 p-4">
              <p className="flex items-center gap-2 font-medium text-[var(--trust)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--trust)]" />{collectionHealth === 'healthy' ? 'Healthy' : collectionHealth}</p>
              {lastCollectedAt ? <p className="mt-3 border-t border-[var(--trust)]/20 pt-3 font-mono text-[9px] uppercase text-muted-foreground">Last checked {formatDate(lastCollectedAt)}</p> : null}
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
                  <span className="font-mono text-[9px] text-muted-foreground">{value}%</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[9px] uppercase leading-4 text-muted-foreground">{automaticSourceCount} automatic · {manualSourceCount} manual sources</p>
            <Link href="/methodology" className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline">View methodology <ArrowRight className="h-3 w-3" /></Link>
          </section>

          <section className="mt-7 border-t border-border pt-5">
            <h2 className="font-display text-2xl">How to read this feed</h2>
            <div className="mt-4 space-y-5">
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--trust)]" fill="currentColor" /><div><p className="text-sm font-semibold">Verified</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Checked against the linked official source and confirmed as published.</p></div></div>
              <div className="flex gap-3 border-t border-border pt-4"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--caution)]" /><div><p className="text-sm font-semibold">Needs review</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Detected by automated monitoring and not yet checked against an official source.</p></div></div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
