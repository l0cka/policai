'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}

interface FilterControlsProps {
  groups: FilterGroup[];
  onClear: () => void;
  hasActiveFilters: boolean;
  className?: string;
}

export function FilterControls({
  groups,
  onClear,
  hasActiveFilters,
  className,
}: FilterControlsProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
          Filters
        </span>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-8 items-center gap-1 text-xs text-primary hover:underline"
          >
            Clear all
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {groups.map((group) => (
        <fieldset key={group.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
          <legend className="mb-3 text-sm font-medium">{group.label}</legend>
          <div className="space-y-2.5">
            {group.options.map((option) => {
              const checked = group.selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="group flex min-h-6 cursor-pointer items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => group.onToggle(option.value)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background group-hover:border-foreground/50',
                    )}
                    aria-hidden="true"
                  >
                    {checked ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                  </span>
                  <span className="flex-1 leading-5">{option.label}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/75">
                    {option.count}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function FilterSidebar(props: FilterControlsProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border pr-8 lg:block">
      <FilterControls {...props} className="sticky top-[8.5rem] py-5" />
    </aside>
  );
}
