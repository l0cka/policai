import type { ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const CONTROL = 'h-11 w-full rounded-md border border-input bg-background text-sm focus:border-primary';
const ICON = 'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground';

export function FilterBar({
  label,
  shown,
  total,
  noun,
  active,
  onClear,
  children,
}: {
  label: string;
  shown: number;
  total: number;
  noun: string;
  active: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="border-y border-border bg-muted/30 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-3 text-xs text-muted-foreground">
        <p className="tabular" aria-live="polite">{shown} of {total} {noun}</p>
        {active ? (
          <button type="button" onClick={onClear} className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline">
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Clear filters
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function FilterSearch({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative sm:min-w-64 sm:flex-1">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" className={`${ICON} left-3`} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${CONTROL} pl-10 pr-3`}
      />
    </label>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative sm:w-52">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} appearance-none pl-3 pr-9`}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className={`${ICON} right-3`} />
    </label>
  );
}
