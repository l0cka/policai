'use client';

import { Search, X } from 'lucide-react';
import { JURISDICTION_NAMES, type Jurisdiction } from '@/types';
import { JURISDICTION_COLORS } from './jurisdiction-colors';

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
    <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-3 bg-card/90 backdrop-blur-lg border border-border rounded-xl px-4 py-2.5 shadow-sm">
      {/* Search */}
      <div className="relative flex-shrink-0 w-48">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search policies..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-muted/50 border border-border rounded-lg pl-7 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
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
      <div className="w-px h-6 bg-border" />

      {/* Jurisdiction pills */}
      <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
        {jurisdictions.map((j) => {
          const active = activeJurisdictions.has(j.key);
          return (
            <button
              key={j.key}
              onClick={() => onToggleJurisdiction(j.key)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
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
      <div className="flex-shrink-0 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        <strong className="text-foreground">{totalPolicies}</strong> policies
      </div>
    </div>
  );
}
