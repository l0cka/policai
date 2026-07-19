'use client';

import { Search, X } from 'lucide-react';

interface JurisdictionInfo {
  key: string;
  label: string;
  color: string;
  count: number;
}

interface NetworkToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  jurisdictions: JurisdictionInfo[];
  activeJurisdictions: Set<string>;
  onToggleJurisdiction: (key: string) => void;
  totalPolicies: number;
}

export function NetworkToolbar({
  searchQuery,
  onSearchChange,
  jurisdictions,
  activeJurisdictions,
  onToggleJurisdiction,
  totalPolicies,
}: NetworkToolbarProps) {
  return (
    <div className="absolute left-3 right-3 top-3 z-10 flex flex-col gap-3 border border-border bg-background/95 px-3 py-3 backdrop-blur-lg md:left-4 md:right-4 md:top-4 md:flex-row md:items-center md:px-4 md:py-2.5">
      {/* Search */}
      <div className="relative w-full shrink-0 md:w-56">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search policies..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full border border-border bg-background pl-8 pr-8 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="hidden h-6 w-px bg-border md:block" />

      {/* Jurisdiction pills */}
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto md:flex-wrap">
        {jurisdictions.map((j) => {
          const active = activeJurisdictions.has(j.key);
          return (
            <button
              key={j.key}
              onClick={() => onToggleJurisdiction(j.key)}
              className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all"
              style={
                active
                  ? { background: j.color, color: 'white' }
                  : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }
              }
            >
              {j.label}
              <span className="opacity-70">{j.count}</span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="hidden shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground sm:block">
        <strong className="text-foreground">{totalPolicies}</strong> policies
      </div>
    </div>
  );
}
