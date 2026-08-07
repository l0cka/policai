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
  ArrowUpDown,
  ArrowUpRight,
  CheckCircle2,
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
import { HealthSignal } from '@/components/ui/health-signal';
import { MetricStrip } from '@/components/layout/PageIntro';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
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
    <div className="inline-flex h-11 rounded-md border border-input" aria-label="Policy view">
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
      ? `All ${dueSourceCount} due sources reached`
      : `${successfulSourceCount}/${dueSourceCount} due sources reached`;

  return (
    <div>
      {/*
        No display heading here. The register is what the page is for, so it
        opens on the data with the title reduced to a label.
      */}
      <section className="container mx-auto px-4 pb-2 pt-7 sm:px-6 lg:px-8">
        <div className="reveal flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="page-eyebrow">Australian AI policy register</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Legislation, guidance and court practice notes from federal, state
              and territory governments, each linked to its official source.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <HealthSignal health={collectionHealth} />
            <span className="page-eyebrow">
              {freshLabel}
              {freshnessDate ? ` · ${formatDate(freshnessDate)}` : ''}
            </span>
          </div>
        </div>

        <MetricStrip
          className="mt-5"
          metrics={[
            { value: policies.length, label: 'policies' },
            { value: distinctJurisdictions.size, label: 'jurisdictions' },
            { value: developmentCount, label: 'developments' },
            { value: automaticSourceCount, label: 'sources monitored' },
          ]}
        />
      </section>

      <section className="reveal reveal-2 container mx-auto px-4 pb-10 sm:px-6 lg:px-8">
        <div className="flex items-stretch">
          <FilterSidebar groups={filterGroups} onClear={clearFilters} hasActiveFilters={hasActiveFilters} />

          <div className="min-w-0 flex-1 py-5 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div id="policy-search" className="relative flex-1 scroll-mt-28">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Search policies, agencies and topics"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background pl-11 pr-14 text-sm outline-none transition-[border-color,box-shadow] duration-[var(--dur-base)] placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:block">
                  ⌘K
                </kbd>
              </div>
              <div className="hidden md:block"><ViewToggle value={viewMode} onChange={setViewMode} /></div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input text-sm font-medium">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto p-5">
                  <SheetHeader className="px-0 pt-0">
                    <SheetTitle className="section-title">Filter policies</SheetTitle>
                    <SheetDescription className="sr-only">
                      Filter the policy register by jurisdiction, policy type, and status.
                    </SheetDescription>
                  </SheetHeader>
                  <FilterControls groups={filterGroups} onClear={clearFilters} hasActiveFilters={hasActiveFilters} />
                </SheetContent>
              </Sheet>
              <label className="relative">
                <span className="sr-only">Sort policies</span>
                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <select
                  value={`${sortField}:${sortDirection}`}
                  onChange={(event) => handleMobileSort(event.target.value)}
                  className="h-11 w-full rounded-md appearance-none border border-input bg-background pl-10 pr-3 text-sm font-medium"
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
                {[...jurisdictions, ...types, ...statuses].map((value) => {
                  const label =
                    JURISDICTION_NAMES[value as keyof typeof JURISDICTION_NAMES] ??
                    POLICY_TYPE_NAMES[value as keyof typeof POLICY_TYPE_NAMES] ??
                    POLICY_STATUS_NAMES[value as keyof typeof POLICY_STATUS_NAMES] ??
                    value;
                  return (
                    <button
                      type="button"
                      key={value}
                      aria-label={`Remove filter: ${label}`}
                      onClick={() => {
                        if (jurisdictions.includes(value)) toggleFilter(value, setJurisdictions);
                        if (types.includes(value)) toggleFilter(value, setTypes);
                        if (statuses.includes(value)) toggleFilter(value, setStatuses);
                      }}
                      className="group inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/30 bg-accent px-3 text-xs font-medium text-primary transition-colors duration-[var(--dur-fast)] hover:border-primary/60 hover:bg-primary hover:text-primary-foreground"
                    >
                      {label}
                      <span aria-hidden="true">×</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {developments.length > 0 ? (
              <Link href="/developments" className="mt-3 flex min-h-11 items-center justify-between rounded-md border border-primary/25 px-4 text-sm text-primary xl:hidden">
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

          <div className="hidden w-[19.5rem] shrink-0 border-l border-[var(--rule-hair)] py-5 pl-7 xl:block">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]">Latest developments</h2>
            </div>
            <div>
              {developments.slice(0, 5).map((development) => (
                <article
                  key={development.id}
                  style={jurisdictionRailStyle(development.jurisdiction)}
                  className="ink-rail content-auto border-b border-border py-4 pl-3"
                >
                  <p className="font-mono text-[11px] font-medium uppercase text-muted-foreground">{formatDevelopmentDate(development)}</p>
                  <a href={development.url} target="_blank" rel="noopener noreferrer" className="group mt-2 inline-flex items-start gap-1.5 text-sm font-semibold leading-5 hover:text-primary">
                    {development.title}
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-55 transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
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
                  Nothing verified yet. Unconfirmed leads are still listed on the radar.
                </p>
              ) : null}
            </div>
            <Link href="/developments" className="group mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
              View all developments <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>

            <div className="mt-7 border-t border-border pt-5 font-mono text-[11px] leading-5 text-muted-foreground">
              <p>{automaticSourceCount} automatic sources</p>
              <p>{currentManualSourceCount}/{manualSourceCount} manual sources checked</p>
              {unavailableManualSourceCount > 0 ? <p>{unavailableManualSourceCount} currently unavailable</p> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
