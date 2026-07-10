'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import { FilterSidebar } from '@/components/filter-sidebar';
import { PolicyTable } from '@/components/policy-table';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  getJurisdictionName,
  type Development,
  type Policy,
} from '@/types';

interface PolicyBrowserProps {
  policies: Policy[];
  developments: Development[];
  lastCollectedAt: string | null;
  lastReviewedAt: string | null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PolicyBrowser({
  policies,
  developments,
  lastCollectedAt,
  lastReviewedAt,
}: PolicyBrowserProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [jurisdictionFilter, setJurisdictionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const hasActiveFilters =
    jurisdictionFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setJurisdictionFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      const matchesSearch =
        search === '' ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
      const matchesJurisdiction =
        jurisdictionFilter === 'all' || p.jurisdiction === jurisdictionFilter;
      const matchesType = typeFilter === 'all' || p.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesJurisdiction && matchesType && matchesStatus;
    });
  }, [policies, search, jurisdictionFilter, typeFilter, statusFilter]);

  const jurisdictions = new Set(policies.map((p) => p.jurisdiction));

  const filters = [
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      value: jurisdictionFilter,
      onChange: setJurisdictionFilter,
      options: [
        { value: 'all', label: 'All jurisdictions' },
        ...Object.entries(JURISDICTION_NAMES).map(([k, v]) => ({ value: k, label: v })),
      ],
    },
    {
      id: 'type',
      label: 'Type',
      value: typeFilter,
      onChange: setTypeFilter,
      options: [
        { value: 'all', label: 'All types' },
        ...Object.entries(POLICY_TYPE_NAMES).map(([k, v]) => ({ value: k, label: v })),
      ],
    },
    {
      id: 'status',
      label: 'Status',
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: 'All statuses' },
        ...Object.entries(POLICY_STATUS_NAMES)
          .filter(([k]) => k !== 'trashed')
          .map(([k, v]) => ({ value: k, label: v })),
      ],
    },
  ];

  const summary = [
    { label: 'policies', value: filteredPolicies.length },
    { label: 'jurisdictions', value: jurisdictions.size },
  ];

  const freshness = lastCollectedAt
    ? `Sources last checked ${formatDate(lastCollectedAt)}`
    : lastReviewedAt
      ? `Data reviewed ${formatDate(lastReviewedAt)}`
      : null;

  return (
    <div className="container mx-auto px-4 py-6">
      {developments.length > 0 && (
        <section aria-label="Latest developments" className="mb-8 border-b border-border pb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Latest developments
            </h2>
            <Link
              href="/developments"
              className="font-mono text-xs text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {developments.map((development) => (
              <li key={development.id} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(development.publishedAt || development.detectedAt)}
                </span>
                <a
                  href={development.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-start gap-1 hover:text-primary transition-colors"
                >
                  <span>
                    {development.title}
                    <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                      {getJurisdictionName(development.jurisdiction)}
                    </span>
                  </span>
                  <ArrowUpRight className="h-3 w-3 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <FilterSidebar
          filters={filters}
          summary={summary}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        <div className="flex-1 min-w-0 pt-1">
          {/* Search */}
          <div className="relative mb-5">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-16 py-2 text-sm bg-transparent border-b border-border focus:border-foreground focus:outline-none transition-colors placeholder:text-muted-foreground"
            />
            <kbd className="absolute right-0 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground/60 border border-border rounded px-1.5 py-0.5">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </div>

          {/* Count + freshness */}
          <div
            className="flex items-center justify-between font-mono text-xs text-muted-foreground mb-3"
            aria-live="polite"
          >
            <span>
              Showing {filteredPolicies.length} of {policies.length} policies
            </span>
            {freshness && <span>{freshness}</span>}
          </div>

          {/* Table */}
          <PolicyTable policies={filteredPolicies} />
        </div>
      </div>
    </div>
  );
}
