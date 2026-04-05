'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterConfig {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface SummaryStat {
  label: string;
  value: number;
}

interface FilterSidebarProps {
  filters: FilterConfig[];
  summary?: SummaryStat[];
  onClear?: () => void;
  hasActiveFilters?: boolean;
}

export function FilterSidebar({ filters, summary, onClear, hasActiveFilters }: FilterSidebarProps) {
  return (
    <aside className="w-full lg:w-60 flex-shrink-0">
      <div className="sticky top-16">
        <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
          Filters
        </div>

        <div className="space-y-4">
          {filters.map((filter) => (
            <div key={filter.id}>
              <label className="font-mono text-xs text-muted-foreground mb-1.5 block">
                {filter.label}
              </label>
              <Select value={filter.value} onValueChange={filter.onChange}>
                <SelectTrigger className="h-8 text-sm rounded bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filter.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {hasActiveFilters && onClear && (
          <button
            onClick={onClear}
            className="mt-3 font-mono text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}

        {summary && summary.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Summary
            </div>
            <div className="space-y-1.5">
              {summary.map((stat) => (
                <div key={stat.label} className="font-mono text-xs">
                  <span className="font-semibold text-foreground">{stat.value}</span>{' '}
                  <span className="text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
