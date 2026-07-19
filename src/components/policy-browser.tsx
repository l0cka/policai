'use client';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Filter,
  List,
  Search,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import { FilterControls, FilterSidebar, type FilterGroup } from '@/components/filter-sidebar';
import {
  PolicyTable,
  type PolicySortDirection,
  type PolicySortField,
  type PolicyViewMode,
} from '@/components/policy-table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { formatPolicyDate } from '@/lib/format-policy-date';
import {
  JURISDICTION_NAMES,
  POLICY_STATUS_NAMES,
  POLICY_TYPE_NAMES,
  getJurisdictionName,
  type CollectionHealthStatus,
  type Development,
  type Policy,
} from '@/types';
import { cn } from '@/lib/utils';

interface PolicyBrowserProps {
  policies: Policy[];
  developments: Development[];
  developmentCount: number;
  lastCollectedAt: string | null;
  lastHealthyAt: string | null;
  lastReviewedAt: string | null;
  collectionHealth: CollectionHealthStatus;
  successfulSourceCount: number;
  dueSourceCount: number;
  automaticSourceCount: number;
  manualSourceCount: number;
  currentManualSourceCount: number;
  unavailableManualSourceCount: number;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDevelopmentDate(development: Development): string {
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

function toggleFilter(
  value: string,
  setter: Dispatch<SetStateAction<string[]>>,
) {
  setter((current) =>
    current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value],
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: PolicyViewMode;
  onChange: (value: PolicyViewMode) => void;
}) {
  return (
    <div className="inline-flex min-h-10 border border-input" aria-label="Policy view">
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={value === 'table'}
        className={cn(
          'inline-flex min-w-20 items-center justify-center gap-2 px-3 text-xs font-medium transition-colors',
          value === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Table2 className="h-4 w-4" strokeWidth={1.8} />
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        className={cn(
          'inline-flex min-w-20 items-center justify-center gap-2 border-l border-input px-3 text-xs font-medium transition-colors',
          value === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List className="h-4 w-4" strokeWidth={1.8} />
        List
      </button>
    </div>
  );
}

export function PolicyBrowser({
  policies,
  developments,
  developmentCount,
  lastCollectedAt,
  lastHealthyAt,
  lastReviewedAt,
  collectionHealth,
  successfulSourceCount,
  dueSourceCount,
  automaticSourceCount,
  manualSourceCount,
  currentManualSourceCount,
  unavailableManualSourceCount,
}: PolicyBrowserProps) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const searchRef = useRef<HTMLInputElement>(null);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<PolicyViewMode>('table');
  const [mobileViewMode, setMobileViewMode] = useState<PolicyViewMode>('list');
  const [sortField, setSortField] = useState<PolicySortField>('effectiveDate');
  const [sortDirection, setSortDirection] = useState<PolicySortDirection>('desc');

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  const filteredPolicies = useMemo(
    () =>
      policies.filter((policy) => {
        const matchesSearch =
          deferredSearch.length === 0 ||
          policy.title.toLowerCase().includes(deferredSearch) ||
          policy.description.toLowerCase().includes(deferredSearch) ||
          policy.tags.some((tag) => tag.toLowerCase().includes(deferredSearch)) ||
          policy.agencies.some((agency) => agency.toLowerCase().includes(deferredSearch));
        const matchesJurisdiction =
          jurisdictions.length === 0 || jurisdictions.includes(policy.jurisdiction);
        const matchesType = types.length === 0 || types.includes(policy.type);
        const matchesStatus = statuses.length === 0 || statuses.includes(policy.status);
        return matchesSearch && matchesJurisdiction && matchesType && matchesStatus;
      }),
    [deferredSearch, jurisdictions, policies, statuses, types],
  );

  const distinctJurisdictions = new Set(policies.map((policy) => policy.jurisdiction));
  const countFor = (key: keyof Pick<Policy, 'jurisdiction' | 'type' | 'status'>, value: string) =>
    policies.filter((policy) => policy[key] === value).length;

  const filterGroups: FilterGroup[] = [
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      selectedValues: jurisdictions,
      onToggle: (value) => toggleFilter(value, setJurisdictions),
      options: Object.entries(JURISDICTION_NAMES)
        .map(([value, label]) => ({ value, label, count: countFor('jurisdiction', value) }))
        .filter((option) => option.count > 0),
    },
    {
      id: 'type',
      label: 'Policy type',
      selectedValues: types,
      onToggle: (value) => toggleFilter(value, setTypes),
      options: Object.entries(POLICY_TYPE_NAMES)
        .map(([value, label]) => ({ value, label, count: countFor('type', value) }))
        .filter((option) => option.count > 0),
    },
    {
      id: 'status',
      label: 'Status',
      selectedValues: statuses,
      onToggle: (value) => toggleFilter(value, setStatuses),
      options: Object.entries(POLICY_STATUS_NAMES)
        .filter(([value]) => value !== 'trashed')
        .map(([value, label]) => ({ value, label, count: countFor('status', value) }))
        .filter((option) => option.count > 0),
    },
  ];

  const activeFilterCount = jurisdictions.length + types.length + statuses.length;
  const hasActiveFilters = activeFilterCount > 0;
  const clearFilters = () => {
    setJurisdictions([]);
    setTypes([]);
    setStatuses([]);
  };

  const handleSort = (field: PolicySortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection(field === 'effectiveDate' ? 'desc' : 'asc');
  };

  const handleMobileSort = (value: string) => {
    const [field, direction] = value.split(':') as [PolicySortField, PolicySortDirection];
    setSortField(field);
    setSortDirection(direction);
  };

  const freshnessDate = lastHealthyAt ?? lastCollectedAt ?? lastReviewedAt;
  const freshLabel =
    collectionHealth === 'healthy'
      ? 'Continuous monitoring of official sources'
      : `${successfulSourceCount}/${dueSourceCount} due sources reached`;

  return (
    <div>
      <section className="container mx-auto px-4 pb-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-6">
        <div className="grid gap-6 border-b border-border pb-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end">
          <div>
            <h1 className="max-w-5xl font-display text-[clamp(2.65rem,4.5vw,4.5rem)] leading-[0.98] tracking-[-0.035em]">
              Australian AI policy, made legible.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:hidden">
              Track AI policies, strategies and frameworks across governments.
            </p>
            <p className="mt-4 hidden max-w-2xl text-base leading-7 text-muted-foreground sm:block">
              Track policies, strategies and frameworks across Australian governments.
              Verified sources, clear status and transparent provenance.
            </p>
          </div>
          <div className="hidden border-l border-border pl-5 lg:mb-1 lg:block">
            <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--trust)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--trust)]" />
              {collectionHealth === 'healthy' ? 'Live' : collectionHealth}
            </p>
            <p className="mt-2 text-sm">{freshLabel}</p>
            {freshnessDate ? (
              <p className="mt-2 font-mono text-[11px] uppercase text-muted-foreground">
                {formatDate(freshnessDate)}
              </p>
            ) : null}
          </div>
        </div>

        <p className="border-b border-border py-4 text-sm text-muted-foreground md:hidden">
          <span className="font-display text-2xl text-primary">{policies.length}</span> policies
          <span className="mx-2">·</span>
          <span className="font-display text-2xl text-primary">{distinctJurisdictions.size}</span> jurisdictions
          <span className="mx-2">·</span>
          <span className="text-[var(--trust)]">Verified sources</span>
        </p>
        <dl className="hidden grid-cols-2 border-b border-border md:grid md:grid-cols-4">
          {[
            [policies.length, 'policies'],
            [distinctJurisdictions.size, 'jurisdictions'],
            [developmentCount, 'developments'],
            [automaticSourceCount, 'sources monitored'],
          ].map(([value, label], index) => (
            <div key={label} className={cn('flex items-baseline justify-center gap-2 py-4 md:py-5', index % 2 === 1 ? 'border-l border-border' : '', index > 1 ? 'border-t border-border md:border-t-0 md:border-l' : '', index === 1 ? 'md:border-l' : '')}>
              <dt className="order-2 text-xs text-muted-foreground">{label}</dt>
              <dd className="font-display text-4xl leading-none text-primary">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="container mx-auto px-4 pb-10 sm:px-6 lg:px-8">
        <div className="flex items-stretch">
          <FilterSidebar groups={filterGroups} onClear={clearFilters} hasActiveFilters={hasActiveFilters} />

          <div className="min-w-0 flex-1 py-5 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div id="policy-search" className="relative flex-1 scroll-mt-36">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Search policies, agencies and topics"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full border border-input bg-background pl-11 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
                  ⌘K
                </kbd>
              </div>
              <div className="hidden md:block"><ViewToggle value={viewMode} onChange={setViewMode} /></div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 border border-input text-sm font-medium">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto p-5">
                  <SheetHeader className="px-0 pt-0">
                    <SheetTitle className="font-display text-2xl">Filter policies</SheetTitle>
                    <SheetDescription className="sr-only">
                      Filter the policy register by jurisdiction, policy type, and status.
                    </SheetDescription>
                  </SheetHeader>
                  <FilterControls groups={filterGroups} onClear={clearFilters} hasActiveFilters={hasActiveFilters} />
                </SheetContent>
              </Sheet>
              <label className="relative">
                <span className="sr-only">Sort policies</span>
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <select
                  value={`${sortField}:${sortDirection}`}
                  onChange={(event) => handleMobileSort(event.target.value)}
                  className="h-11 w-full appearance-none border border-input bg-background pl-10 pr-3 text-sm font-medium"
                >
                  <option value="effectiveDate:desc">Sort: Key date</option>
                  <option value="title:asc">Sort: A–Z</option>
                  <option value="jurisdiction:asc">Sort: Jurisdiction</option>
                  <option value="status:asc">Sort: Status</option>
                </select>
              </label>
            </div>

            {hasActiveFilters ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[...jurisdictions, ...types, ...statuses].map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => {
                      if (jurisdictions.includes(value)) toggleFilter(value, setJurisdictions);
                      if (types.includes(value)) toggleFilter(value, setTypes);
                      if (statuses.includes(value)) toggleFilter(value, setStatuses);
                    }}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--trust)]/25 bg-[var(--status-active-bg)] px-3 text-xs text-[var(--trust)]"
                  >
                    {JURISDICTION_NAMES[value as keyof typeof JURISDICTION_NAMES] ?? POLICY_TYPE_NAMES[value as keyof typeof POLICY_TYPE_NAMES] ?? POLICY_STATUS_NAMES[value as keyof typeof POLICY_STATUS_NAMES] ?? value}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            ) : null}

            {developments.length > 0 ? (
              <Link href="/developments" className="mt-3 flex min-h-11 items-center justify-between border border-primary/25 px-4 text-sm text-primary xl:hidden">
                <span>{developments.length} new verified developments</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}

            <div className="mb-3 mt-5 flex items-center justify-between">
              <p className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
                {filteredPolicies.length} {filteredPolicies.length === 1 ? 'policy' : 'policies'}
              </p>
              <div className="md:hidden"><ViewToggle value={mobileViewMode} onChange={setMobileViewMode} /></div>
            </div>

            <PolicyTable
              policies={filteredPolicies}
              viewMode={viewMode}
              mobileViewMode={mobileViewMode}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </div>

          <aside className="hidden w-[19.5rem] shrink-0 border-l border-border py-5 pl-7 xl:block">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Latest developments</h2>
            </div>
            <div>
              {developments.slice(0, 5).map((development) => (
                <article key={development.id} className="content-auto border-b border-border py-4">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">{formatDevelopmentDate(development)}</p>
                  <a href={development.url} target="_blank" rel="noopener noreferrer" className="group mt-2 inline-flex items-start gap-1.5 text-sm font-semibold leading-5 hover:text-primary">
                    {development.title}
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-55 group-hover:opacity-100" />
                  </a>
                  {development.summary ? <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-muted-foreground">{development.summary}</p> : null}
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--trust)]" fill="currentColor" />
                    {getJurisdictionName(development.jurisdiction)}
                  </p>
                </article>
              ))}
              {developments.length === 0 ? (
                <p className="border-b border-border py-5 text-xs leading-5 text-muted-foreground">
                  No newly verified developments are published. Automated leads remain available in the radar.
                </p>
              ) : null}
            </div>
            <Link href="/developments" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
              View all developments <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <div className="mt-7 border-t border-border pt-5 font-mono text-[10px] leading-5 text-muted-foreground">
              <p>{automaticSourceCount} automatic sources</p>
              <p>{currentManualSourceCount}/{manualSourceCount} manual sources checked</p>
              {unavailableManualSourceCount > 0 ? <p>{unavailableManualSourceCount} currently unavailable</p> : null}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
