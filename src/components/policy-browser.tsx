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
import { PolicyObservatory } from '@/components/policy-observatory';
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
  /** Developments first detected in the last seven days, dismissed excluded. */
  weeklyDevelopmentCount: number;
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
  weeklyDevelopmentCount,
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

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    document.getElementById('policy-register')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--hero-bg)] text-white">
        <div className="container relative mx-auto grid min-h-[38rem] gap-12 px-4 sm:px-6 md:grid-cols-[0.72fr_1.28fr] md:gap-0 lg:px-8">
          <div className="reveal flex max-w-[34rem] flex-col justify-center py-12 pr-0 md:py-10 md:pr-8 lg:pr-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--hero-accent)]">
              The policy observatory
            </p>
            <h1 className="mt-5 max-w-[29rem] font-sans text-[clamp(2.3rem,3.6vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.01em] text-white">
              See Australian AI policy as it changes.
            </h1>
            <p className="mt-5 max-w-[29rem] text-[14px] leading-6 text-white/64">
              Policai tracks official AI policy across Australia, checked daily,
              with every record linked to its source.
            </p>

            <form
              id="policy-search"
              onSubmit={handleSearchSubmit}
              className="mt-8 scroll-mt-28"
              role="search"
            >
              <label className="sr-only" htmlFor="observatory-search">
                Search the Australian AI policy register
              </label>
              <div className="group flex max-w-[31rem] items-center border border-white/30 bg-transparent transition-colors focus-within:border-[var(--hero-accent)] focus-within:bg-white/[0.035]">
                <Search className="ml-4 h-[18px] w-[18px] shrink-0 text-white/45" strokeWidth={1.7} />
                <input
                  id="observatory-search"
                  ref={searchRef}
                  type="search"
                  placeholder="Search policies, agencies or topics"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-[3.35rem] min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/48"
                />
                <kbd className="mr-3 border border-white/24 px-1.5 py-1 font-mono text-[9px] text-white/42">⌘K</kbd>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
                <button
                  type="submit"
                  className="group inline-flex h-12 items-center gap-4 rounded-[2px] bg-[var(--hero-cta)] px-6 font-semibold text-white transition-[filter] hover:brightness-110"
                >
                  Search the register
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2} />
                </button>
                <Link href="/developments" className="group inline-flex items-center gap-3 font-medium text-[var(--hero-accent)] hover:text-white">
                  View developments
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </form>

            {/* Each figure is a doorway, not a decoration. */}
            <div className="mt-9 grid max-w-[31rem] grid-cols-4">
              {(
                [
                  { value: policies.length, label: 'verified policies', href: '#policy-register', delta: null },
                  { value: distinctJurisdictions.size, label: 'jurisdictions', href: '#policy-register', delta: null },
                  { value: developmentCount, label: 'developments', href: '/developments', delta: weeklyDevelopmentCount },
                  { value: automaticSourceCount, label: 'sources monitored', href: '/methodology', delta: null },
                ] as const
              ).map((stat, index) => {
                const StatLink = stat.href.startsWith('#') ? 'a' : Link;
                return (
                  <StatLink
                    key={stat.label}
                    href={stat.href}
                    className={cn(
                      'group/stat block pr-3 transition-colors duration-[var(--dur-fast)]',
                      index > 0 && 'border-l border-white/20 pl-5',
                    )}
                  >
                    <strong className="block text-[1.55rem] font-medium leading-none text-white transition-colors duration-[var(--dur-fast)] group-hover/stat:text-[var(--hero-accent)]">
                      {stat.value}
                    </strong>
                    <span className="mt-2 block text-[10px] leading-4 text-white/55 transition-colors duration-[var(--dur-fast)] group-hover/stat:text-white/80">
                      {stat.label}
                    </span>
                    {stat.delta ? (
                      <span className="mt-1 block text-[10px] leading-4 text-[var(--hero-trust)]">
                        +{stat.delta} this week
                      </span>
                    ) : null}
                  </StatLink>
                );
              })}
            </div>
          </div>

          <div className="reveal reveal-2 flex min-w-0 items-center border-t border-white/18 py-10 md:border-l md:border-t-0 md:pl-8 lg:pl-9">
            <PolicyObservatory policies={policies} currentAt={freshnessDate} />
          </div>
        </div>
      </section>

      <section className="border-y border-white/16 bg-[var(--hero-bg)] text-white">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-6 pb-4">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--hero-accent)]">
              What changed recently
            </h2>
            <Link href="/developments" className="group hidden items-center gap-3 text-xs font-medium text-[var(--hero-accent)] hover:text-white sm:inline-flex">
              View all developments
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3">
            {developments.slice(0, 3).map((development, index) => (
              <article
                key={development.id}
                style={jurisdictionRailStyle(development.jurisdiction)}
                className={cn(
                  'ink-rail py-6 md:px-6',
                  index > 0 && 'border-t border-white/18 md:border-l md:border-t-0',
                  index === 0 && 'md:pl-0',
                )}
              >
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-white/58">
                  {formatDevelopmentDate(development)}
                </p>
                <a
                  href={development.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-3 inline-flex max-w-[23rem] items-start gap-2 text-[15px] font-semibold leading-6 hover:text-[var(--hero-accent)]"
                >
                  {development.title}
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 opacity-45 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                </a>
                {development.summary ? (
                  <p className="mt-2 line-clamp-2 max-w-[25rem] text-xs leading-5 text-white/58">
                    {development.summary}
                  </p>
                ) : null}
                <p className="mt-4 flex items-center gap-2 text-[11px] text-white/60">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--hero-trust)]" fill="currentColor" />
                  {getJurisdictionName(development.jurisdiction)}
                  <span className="text-white/24">|</span>
                  Verified source
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="policy-register" className="reveal reveal-2 container mx-auto scroll-mt-28 px-4 pb-10 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-[var(--rule-heavy)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-eyebrow">Source-linked records</p>
            <h2 className="mt-2 font-display text-[1.8rem] leading-tight tracking-[-0.01em]">Policy register</h2>
          </div>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                collectionHealth === 'healthy' ? 'bg-[var(--trust)]' : 'bg-[var(--caution)]',
              )}
            />
            {freshLabel}{freshnessDate ? ` · ${formatDate(freshnessDate)}` : ''}
          </div>
        </div>

        <div className="flex items-stretch">
          <FilterSidebar groups={filterGroups} onClear={clearFilters} hasActiveFilters={hasActiveFilters} />

          <div className="min-w-0 flex-1 py-5 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
                  {filteredPolicies.length} {filteredPolicies.length === 1 ? 'policy' : 'policies'}
                  {search ? ` matching “${search}”` : ''}
                </p>
                {search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      searchRef.current?.focus();
                    }}
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    Clear search
                  </button>
                ) : null}
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

            <div className="mb-3 mt-5 flex items-center justify-end">
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

        </div>

        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--rule-hair)] pt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          <span>{automaticSourceCount} automatic sources</span>
          <span>{currentManualSourceCount}/{manualSourceCount} manual sources checked</span>
          {unavailableManualSourceCount > 0 ? <span>{unavailableManualSourceCount} unavailable</span> : null}
        </div>
      </section>
    </div>
  );
}
