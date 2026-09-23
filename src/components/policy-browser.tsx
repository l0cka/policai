'use client';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, List, Search, Table2 } from 'lucide-react';
import { FilterControls, type FilterGroup } from '@/components/filter-sidebar';
import { PolicyTable } from '@/components/policy-table';
import { selectRegisterPolicies, type PolicySortDirection, type PolicySortField, type PolicyViewMode } from '@/lib/policy-register';
import { useRegisterState } from '@/hooks/use-register-state';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { upcomingDateCountdown, type UpcomingPolicyDate } from '@/lib/this-week';
import {
  JURISDICTION_NAMES,
  POLICY_STATUS_NAMES,
  POLICY_TYPE_NAMES,
  getJurisdictionName,
  getPolicyDateTypeName,
  type CollectionHealthStatus,
  type Development,
  type Policy,
} from '@/types';
import { cn } from '@/lib/utils';

interface PolicyBrowserProps {
  policies: Policy[];
  /** Upcoming recorded dates from public records, soonest first. */
  upcomingDates?: UpcomingPolicyDate[];
  /** The Sydney calendar day (YYYY-MM-DD) countdowns are measured from. */
  today?: string;
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

function toggleFilter(value: string, current: string[], setter: (values: string[]) => void) {
  setter(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
}

function ViewToggle({
  value,
  onChange,
}: {
  value: PolicyViewMode;
  onChange: (value: PolicyViewMode) => void;
}) {
  return (
    <div
      className="inline-flex h-11 rounded-md border border-input"
      role="group"
      aria-label="Policy view"
    >
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={value === 'table'}
        className={cn(
          'inline-flex min-w-20 items-center justify-center gap-2 px-3 text-xs font-medium transition-colors',
          value === 'table'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
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
          value === 'list'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
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
  upcomingDates = [],
  today,
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
  const [state, updateState] = useRegisterState();
  const { search, jurisdictions, types, statuses, viewMode, sortField, sortDirection, page } = state;
  const setSearch = (search: string) => updateState({ search });
  const setJurisdictions = (jurisdictions: string[]) => updateState({ jurisdictions });
  const setTypes = (types: string[]) => updateState({ types });
  const setStatuses = (statuses: string[]) => updateState({ statuses });
  const setViewMode = (viewMode: PolicyViewMode) => updateState({ viewMode });
  const deferredState = useDeferredValue(state);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const filteredPolicies = useMemo(() => selectRegisterPolicies(policies, deferredState), [policies, deferredState]);

  const countFor = (
    key: keyof Pick<Policy, 'jurisdiction' | 'type' | 'status'>,
    value: string,
  ) => policies.filter((policy) => policy[key] === value).length;

  const filterGroups: FilterGroup[] = [
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      selectedValues: jurisdictions,
      onToggle: (value) => toggleFilter(value, jurisdictions, setJurisdictions),
      options: Object.entries(JURISDICTION_NAMES)
        .map(([value, label]) => ({
          value,
          label,
          count: countFor('jurisdiction', value),
        }))
        .filter((option) => option.count > 0),
    },
    {
      id: 'type',
      label: 'Policy type',
      selectedValues: types,
      onToggle: (value) => toggleFilter(value, types, setTypes),
      options: Object.entries(POLICY_TYPE_NAMES)
        .map(([value, label]) => ({
          value,
          label,
          count: countFor('type', value),
        }))
        .filter((option) => option.count > 0),
    },
    {
      id: 'status',
      label: 'Status',
      selectedValues: statuses,
      onToggle: (value) => toggleFilter(value, statuses, setStatuses),
      options: Object.entries(POLICY_STATUS_NAMES)
        .filter(([value]) => value !== 'trashed')
        .map(([value, label]) => ({
          value,
          label,
          count: countFor('status', value),
        }))
        .filter((option) => option.count > 0),
    },
  ];

  const activeFilterCount =
    jurisdictions.length + types.length + statuses.length;
  const hasActiveFilters = activeFilterCount > 0;
  const clearFilters = () => updateState({ jurisdictions: [], types: [], statuses: [] });
  const resetSearch = () => {
    updateState({ search: '', jurisdictions: [], types: [], statuses: [] });
    searchRef.current?.focus();
  };
  const handleSort = (field: PolicySortField) => updateState({
    sortField: field,
    sortDirection: sortField === field ? (sortDirection === 'asc' ? 'desc' : 'asc') : field === 'effectiveDate' ? 'desc' : 'asc',
  });
  const handleMobileSort = (value: string) => {
    const [sortField, sortDirection] = value.split(':') as [PolicySortField, PolicySortDirection];
    updateState({ sortField, sortDirection });
  };

  const freshnessDate = lastHealthyAt ?? lastCollectedAt ?? lastReviewedAt;
  const freshLabel =
    collectionHealth === 'healthy'
      ? `All ${dueSourceCount} due sources reached`
      : `${successfulSourceCount}/${dueSourceCount} due sources reached`;

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    document
      .getElementById('policy-register')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="editorial-register container mx-auto px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-eyebrow text-primary">
            The Australian AI policy register
          </p>
          <h1 className="mt-2 font-display text-[clamp(2.25rem,4vw,3rem)] leading-tight tracking-[-0.035em]">
            Australian AI policy.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Find Australian AI policies, regulation and court guidance. Go
            straight to the source.
          </p>
        </div>
        <Link
          href="/methodology"
          className="text-xs text-primary underline underline-offset-4"
        >
          How records are verified
        </Link>
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_232px]">
        <section
          id="policy-register"
          aria-label="Policy register"
          className="min-w-0 scroll-mt-32"
        >
          <form role="search" onSubmit={handleSearchSubmit}>
            <label className="sr-only" htmlFor="register-search">
              Search policies, agencies or topics
            </label>
            <div className="flex h-14 items-center gap-3 rounded border border-input bg-card px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <Search
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="register-search"
                ref={searchRef}
                type="search"
                placeholder="Search policies, agencies or topics…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden whitespace-nowrap rounded border border-border px-1.5 py-1 text-[10px] text-muted-foreground sm:block">
                Ctrl / ⌘ K
              </kbd>
            </div>
          </form>
          <div
            role="group"
            aria-label="Register filters"
            className="relative my-4 flex flex-wrap items-start gap-2"
          >
            {filterGroups.map((group) => (
              <details
                key={group.id}
                name="register-filter"
                className="editorial-filter"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded border border-input px-3 text-xs hover:bg-muted">
                  {group.label}
                  {group.selectedValues.length
                    ? ` (${group.selectedValues.length})`
                    : ''}
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </summary>
                <div className="editorial-filter-options">
                  <FilterControls
                    groups={[group]}
                    onClear={clearFilters}
                    hasActiveFilters={false}
                  />
                </div>
              </details>
            ))}
            {(hasActiveFilters || search) && (
              <button
                type="button"
                onClick={resetSearch}
                className="min-h-11 px-2 text-xs text-primary underline underline-offset-4"
              >
                Clear search and filters
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <div className="mb-4 flex flex-wrap gap-2">
              {filterGroups.flatMap((group) =>
                group.options
                  .filter((option) =>
                    group.selectedValues.includes(option.value),
                  )
                  .map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={`Remove filter: ${option.label}`}
                      onClick={() => group.onToggle(option.value)}
                      className="inline-flex min-h-11 items-center gap-3 rounded border border-primary/30 bg-accent px-3 text-xs text-primary"
                    >
                      {option.label}
                      <span aria-hidden="true">×</span>
                    </button>
                  )),
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <p id="register-results" tabIndex={-1} role="status" className="scroll-mt-32 text-sm text-muted-foreground">
              {filteredPolicies.length}{' '}
              {filteredPolicies.length === 1 ? 'policy' : 'policies'}
              {search ? ` matching “${search}”` : ' in the register'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="sr-only">Sort policies</span>
                <select
                  value={`${sortField}:${sortDirection}`}
                  onChange={(event) => handleMobileSort(event.target.value)}
                  className="min-h-11 max-w-full rounded border border-border bg-background px-2 text-xs"
                >
                  <option value="effectiveDate:desc">Key date · newest</option>
                  <option value="effectiveDate:asc">Key date · oldest</option>
                  <option value="title:asc">Title · A–Z</option>
                  <option value="title:desc">Title · Z–A</option>
                  <option value="jurisdiction:asc">Jurisdiction · A–Z</option>
                  <option value="jurisdiction:desc">Jurisdiction · Z–A</option>
                  <option value="type:asc">Policy type · A–Z</option>
                  <option value="type:desc">Policy type · Z–A</option>
                  <option value="status:asc">Status · A–Z</option>
                  <option value="status:desc">Status · Z–A</option>
                </select>
              </label>
              <div className="hidden md:block">
                <ViewToggle value={viewMode} onChange={setViewMode} />
              </div>
              <div className="md:hidden">
                <ViewToggle
                  value={viewMode}
                  onChange={setViewMode}
                />
              </div>
            </div>
          </div>
          <PolicyTable
            policies={filteredPolicies}
            viewMode={viewMode}
            mobileViewMode={viewMode}
            page={page}
            onPageChange={(page) => updateState({ page })}
            onReset={resetSearch}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        </section>
        <aside
          aria-label="Register overview"
          className="space-y-7 border-t border-border pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0"
        >
          <section>
            <h2 className="text-sm font-semibold">Browse by jurisdiction</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-5 xl:grid-cols-1">
              {filterGroups[0].options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={jurisdictions.includes(option.value)}
                  onClick={() => toggleFilter(option.value, jurisdictions, setJurisdictions)}
                  className="flex min-h-11 items-center justify-between gap-3 text-left text-xs text-muted-foreground hover:text-primary aria-pressed:font-semibold aria-pressed:text-primary"
                >
                  <span>{option.label}</span>
                  <span className="tabular-nums">{option.count}</span>
                </button>
              ))}
            </div>
          </section>
          {upcomingDates.length > 0 && today ? (
            <section className="border-t border-border pt-6">
              <h2 className="text-sm font-semibold">Coming up</h2>
              <ul className="mt-3 space-y-3">
                {upcomingDates.slice(0, 5).map((item) => {
                  const countdown = upcomingDateCountdown(item, today);
                  return (
                    <li key={`${item.policyId}-${item.dateType}-${item.date}`}>
                      <p className="text-[11px] text-muted-foreground">
                        {getPolicyDateTypeName(item.dateType)} ·{' '}
                        {formatPolicyDate({ type: item.dateType, date: item.date, precision: item.precision })}
                        {countdown ? ` · ${countdown}` : ''}
                      </p>
                      <Link
                        href={`/policies/${item.policyId}`}
                        className="mt-1 inline-block text-xs leading-5 text-primary underline underline-offset-4"
                      >
                        {item.policyTitle}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                href="/this-week"
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs text-primary"
              >
                All upcoming dates <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </section>
          ) : null}
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">
              A register, not legal advice.
            </h2>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Every record links to its source. Check the official document for
              scope, commencement and current obligations.
            </p>
            <Link
              href="/methodology"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs text-primary"
            >
              About the register <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </section>
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Looking for what’s new?</h2>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Automated detections are separate from verified register records.
            </p>
            <Link
              href="/developments"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs text-primary"
            >
              Browse developments <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <p className="text-xs leading-5 text-muted-foreground">
              {developmentCount} developments · {weeklyDevelopmentCount}{' '}
              detected in the latest collection week
            </p>
          </section>
          {developments.length > 0 && (
            <section className="border-t border-border pt-6">
              <h2 className="text-sm font-semibold">
                Recently verified developments
              </h2>
              {developments.slice(0, 3).map((development) => (
                <article key={development.id} className="mt-4">
                  <p className="text-[11px] text-muted-foreground">
                    {formatDevelopmentDate(development)} ·{' '}
                    {getJurisdictionName(development.jurisdiction)}
                  </p>
                  <a
                    href={development.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs leading-5 text-primary underline underline-offset-4"
                  >
                    {development.title} ↗
                  </a>
                </article>
              ))}
            </section>
          )}
          <section className="border-t border-border pt-6 text-xs leading-6 text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">
              Source coverage
            </h2>
            <p className="mt-3">
              {freshLabel}
              {freshnessDate ? ` · ${formatDate(freshnessDate)}` : ''}
            </p>
            <p>{automaticSourceCount} automatic sources</p>
            <p>
              {currentManualSourceCount}/{manualSourceCount} manual sources
              checked
              {unavailableManualSourceCount > 0
                ? ` · ${unavailableManualSourceCount} unavailable`
                : ''}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
