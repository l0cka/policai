'use client';

import {
  Check,
  Copy,
  Filter,
  Focus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { NetworkTheme } from '@/lib/network-data';
import type {
  NetworkRelationFilter,
  NetworkViewMode,
} from '@/lib/network-view-state';

interface JurisdictionInfo {
  key: string;
  label: string;
  count: number;
}

interface NetworkToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  themes: NetworkTheme[];
  selectedTheme: string | null;
  onThemeChange: (theme: string | null) => void;
  jurisdictions: JurisdictionInfo[];
  activeJurisdictions: Set<string>;
  onToggleJurisdiction: (key: string) => void;
  relationFilter: NetworkRelationFilter;
  onRelationFilterChange: (value: NetworkRelationFilter) => void;
  viewMode: NetworkViewMode;
  onViewModeChange: (value: NetworkViewMode) => void;
  visiblePolicies: number;
  totalPolicies: number;
  onReset: () => void;
  onCopyLink: () => void;
  copied: boolean;
}

export function NetworkToolbar({
  searchQuery,
  onSearchChange,
  themes,
  selectedTheme,
  onThemeChange,
  jurisdictions,
  activeJurisdictions,
  onToggleJurisdiction,
  relationFilter,
  onRelationFilterChange,
  viewMode,
  onViewModeChange,
  visiblePolicies,
  totalPolicies,
  onReset,
  onCopyLink,
  copied,
}: NetworkToolbarProps) {
  const selectedThemeLabel =
    themes.find((theme) => theme.key === selectedTheme)?.label ?? null;
  const filteredJurisdictionCount =
    jurisdictions.length - activeJurisdictions.size;

  return (
    <div className="network-toolbar border-b border-border bg-background/95 p-3 md:p-3.5">
      <div
        className="network-mobile-view mb-3 grid grid-cols-2 border border-border md:hidden"
        aria-label="Network view"
      >
        {(['focus', 'overview'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            aria-pressed={viewMode === mode}
            className={`min-h-11 px-4 text-sm font-medium capitalize transition-colors ${
              viewMode === mode
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground hover:bg-muted'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 md:max-w-64">
          <span className="sr-only">Search policies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search policies"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 w-full border border-input bg-background pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Clear policy search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>

        <div className="network-toolbar-actions ml-auto hidden items-center gap-1.5 lg:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onReset}
            aria-label="Reset network view"
          >
            <RotateCcw />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-none"
            onClick={onCopyLink}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Link copied' : 'Share view'}
          </Button>
        </div>

        <div className="network-toolbar-filters hidden basis-full flex-wrap items-center gap-2 md:flex 2xl:basis-auto 2xl:flex-1">
          <label>
            <span className="sr-only">Theme</span>
            <select
              value={selectedTheme ?? ''}
              onChange={(event) => onThemeChange(event.target.value || null)}
              className="h-11 border border-input bg-background px-3 text-sm"
            >
              <option value="">All themes</option>
              {themes.slice(0, 16).map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label} ({theme.policyCount})
                </option>
              ))}
            </select>
          </label>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-11 rounded-none">
                <Filter />
                Jurisdictions
                {filteredJurisdictionCount > 0
                  ? ` · ${filteredJurisdictionCount} hidden`
                  : ''}
              </Button>
            </SheetTrigger>
            <NetworkFilterSheet
              themes={themes}
              selectedTheme={selectedTheme}
              onThemeChange={onThemeChange}
              jurisdictions={jurisdictions}
              activeJurisdictions={activeJurisdictions}
              onToggleJurisdiction={onToggleJurisdiction}
              relationFilter={relationFilter}
              onRelationFilterChange={onRelationFilterChange}
              onReset={onReset}
              onCopyLink={onCopyLink}
              copied={copied}
            />
          </Sheet>

          <label>
            <span className="sr-only">Relationship type</span>
            <select
              value={relationFilter}
              onChange={(event) =>
                onRelationFilterChange(
                  event.target.value as NetworkRelationFilter,
                )
              }
              className="h-11 border border-input bg-background px-3 text-sm"
            >
              <option value="all">All relationships</option>
              <option value="thematic">Thematic proximity</option>
              <option value="formal">Formal relationships</option>
            </select>
          </label>

          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-none"
            onClick={() =>
              onViewModeChange(viewMode === 'focus' ? 'overview' : 'focus')
            }
            aria-pressed={viewMode === 'focus'}
          >
            <Focus />
            {viewMode === 'focus' ? 'Focused' : 'Overview'}
          </Button>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="network-mobile-filter h-11 rounded-none px-4 md:hidden"
            >
              <Filter />
              Filters
            </Button>
          </SheetTrigger>
          <NetworkFilterSheet
            themes={themes}
            selectedTheme={selectedTheme}
            onThemeChange={onThemeChange}
            jurisdictions={jurisdictions}
            activeJurisdictions={activeJurisdictions}
            onToggleJurisdiction={onToggleJurisdiction}
            relationFilter={relationFilter}
            onRelationFilterChange={onRelationFilterChange}
            onReset={onReset}
            onCopyLink={onCopyLink}
            copied={copied}
          />
        </Sheet>

      </div>

      <div
        className="mt-2 flex min-h-7 flex-wrap items-center gap-2 text-xs"
        aria-live="polite"
      >
        {selectedThemeLabel ? (
          <button
            type="button"
            onClick={() => onThemeChange(null)}
            className="inline-flex min-h-7 items-center gap-1 border border-primary/40 bg-accent px-2 text-primary"
          >
            {selectedThemeLabel}
            <X className="size-3" />
          </button>
        ) : null}
        {relationFilter !== 'all' ? (
          <button
            type="button"
            onClick={() => onRelationFilterChange('all')}
            className="inline-flex min-h-7 items-center gap-1 border border-border bg-muted px-2 capitalize text-muted-foreground"
          >
            {relationFilter}
            <X className="size-3" />
          </button>
        ) : null}
        <span className="font-mono text-[11px] text-muted-foreground">
          <strong className="text-foreground">{visiblePolicies}</strong> of{' '}
          {totalPolicies} policies visible
        </span>
      </div>
    </div>
  );
}

function NetworkFilterSheet({
  themes,
  selectedTheme,
  onThemeChange,
  jurisdictions,
  activeJurisdictions,
  onToggleJurisdiction,
  relationFilter,
  onRelationFilterChange,
  onReset,
  onCopyLink,
  copied,
}: Pick<
  NetworkToolbarProps,
  | 'themes'
  | 'selectedTheme'
  | 'onThemeChange'
  | 'jurisdictions'
  | 'activeJurisdictions'
  | 'onToggleJurisdiction'
  | 'relationFilter'
  | 'onRelationFilterChange'
  | 'onReset'
  | 'onCopyLink'
  | 'copied'
>) {
  return (
    <SheetContent
      side="bottom"
      className="max-h-[85svh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-96 md:border-l md:border-t-0"
    >
      <SheetHeader>
        <SheetTitle>Network filters</SheetTitle>
        <SheetDescription>
          Filter the visible network. Closing this sheet returns you to the
          relationship explorer.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-2">
        <div>
          <label
            htmlFor="network-theme-filter"
            className="mb-2 block text-sm font-medium"
          >
            Theme
          </label>
          <select
            id="network-theme-filter"
            value={selectedTheme ?? ''}
            onChange={(event) => onThemeChange(event.target.value || null)}
            className="h-12 w-full border border-input bg-background px-3 text-sm"
          >
            <option value="">All themes</option>
            {themes.slice(0, 20).map((theme) => (
              <option key={theme.key} value={theme.key}>
                {theme.label} ({theme.policyCount})
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Relationship type</legend>
          <div className="grid gap-2">
            {(
              [
                ['all', 'All relationships'],
                ['thematic', 'Thematic proximity'],
                ['formal', 'Formal relationships'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex min-h-12 items-center gap-3 border border-border px-3 text-sm"
              >
                <input
                  type="radio"
                  name="network-relation-filter"
                  value={value}
                  checked={relationFilter === value}
                  onChange={() => onRelationFilterChange(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Jurisdictions</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {jurisdictions.map((jurisdiction) => {
              const active = activeJurisdictions.has(jurisdiction.key);
              return (
                <button
                  key={jurisdiction.key}
                  type="button"
                  onClick={() => onToggleJurisdiction(jurisdiction.key)}
                  aria-pressed={active}
                  className={`flex min-h-12 items-center justify-between border px-3 text-left text-sm ${
                    active
                      ? 'border-primary bg-accent text-foreground'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  <span>{jurisdiction.label}</span>
                  <span className="font-mono text-[10px]">
                    {jurisdiction.count}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <SheetFooter className="grid grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-none"
          onClick={onReset}
        >
          <RotateCcw />
          Reset
        </Button>
        <Button
          type="button"
          className="h-12 rounded-none"
          onClick={onCopyLink}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </SheetFooter>
    </SheetContent>
  );
}
