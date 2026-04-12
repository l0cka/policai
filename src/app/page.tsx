'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { FilterSidebar } from '@/components/filter-sidebar';
import { PolicyTable } from '@/components/policy-table';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  type Policy,
} from '@/types';

export default function HomePage() {
  const [policiesData, setPoliciesData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [jurisdictionFilter, setJurisdictionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastResearch, setLastResearch] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/policies')
      .then((res) => res.json())
      .then((json) => setPoliciesData(json.data ?? []))
      .catch((err) => console.error('Failed to load policies:', err))
      .finally(() => setLoading(false));

    fetch('/api/status')
      .then((res) => res.json())
      .then((json) => {
        const ts = json.lastPipelineRun?.completedAt || json.lastPipelineRun?.startedAt;
        if (ts) setLastResearch(ts);
      })
      .catch(() => {});
  }, []);

  const hasActiveFilters = jurisdictionFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setJurisdictionFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const filteredPolicies = useMemo(() => {
    return policiesData
      .filter((p) => p.status !== 'trashed')
      .filter((p) => {
        const matchesSearch =
          search === '' ||
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()) ||
          p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
        const matchesJurisdiction = jurisdictionFilter === 'all' || p.jurisdiction === jurisdictionFilter;
        const matchesType = typeFilter === 'all' || p.type === typeFilter;
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesSearch && matchesJurisdiction && matchesType && matchesStatus;
      });
  }, [policiesData, search, jurisdictionFilter, typeFilter, statusFilter]);

  const allPolicies = policiesData.filter((p) => p.status !== 'trashed');
  const jurisdictions = new Set(allPolicies.map((p) => p.jurisdiction));

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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Loading policies...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
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

          {/* Count + last research */}
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground mb-3" aria-live="polite">
            <span>Showing {filteredPolicies.length} of {allPolicies.length} policies</span>
            {lastResearch && (
              <span title={new Date(lastResearch).toLocaleString('en-AU')}>
                Last research: {new Date(lastResearch).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>

          {/* Table */}
          <PolicyTable policies={filteredPolicies} />
        </div>
      </div>
    </div>
  );
}
