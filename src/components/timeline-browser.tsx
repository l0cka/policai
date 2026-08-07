'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Filter, ArrowRight, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusPill, SourceState } from '@/components/policy-table';
import { Timeline, EVENT_TYPE_CONFIG } from '@/components/visualizations/Timeline';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { parseCalendarDateForDisplay } from '@/lib/format-policy-date';
import {
  JURISDICTION_NAMES,
  TIMELINE_EVENT_TYPES,
  getPolicyTypeName,
  type Policy,
  type TimelineEvent,
} from '@/types';
import { MetricStrip, PageIntro } from '@/components/layout';
import { cn } from '@/lib/utils';

export function TimelineBrowser({
  timelineData,
  policiesData,
}: {
  timelineData: TimelineEvent[];
  policiesData: Policy[];
}) {
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const filteredEvents = useMemo(() => {
    return timelineData.filter((event) => {
      const matchesJurisdiction =
        jurisdictionFilter === 'all' || event.jurisdiction === jurisdictionFilter;
      const matchesType = typeFilter === 'all' || event.type === typeFilter;
      return matchesJurisdiction && matchesType;
    });
  }, [jurisdictionFilter, typeFilter, timelineData]);

  // Get related policy details
  const relatedPolicy = selectedEvent?.relatedPolicyId
    ? policiesData.find((p) => p.id === selectedEvent.relatedPolicyId)
    : null;

  // Calculate stats
  const stats = useMemo(() => {
    const years = new Set(
      timelineData.map((event) =>
        parseCalendarDateForDisplay(event.date).getFullYear(),
      ),
    );
    const jurisdictions = new Set(timelineData.map((e) => e.jurisdiction));
    return {
      totalEvents: timelineData.length,
      years: years.size,
      jurisdictions: jurisdictions.size,
      verifiedEvents: timelineData.filter(
        (event) => event.verification.status === 'verified',
      ).length,
    };
  }, [timelineData]);

  const hasActiveFilters = jurisdictionFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => {
    setJurisdictionFilter('all');
    setTypeFilter('all');
  };

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Policy timeline"
        description="Dated events from the register, each linked to the source that recorded it."
      />

      <MetricStrip metrics={[
        { value: stats.totalEvents, label: 'events' },
        { value: stats.years, label: 'years covered' },
        { value: stats.jurisdictions, label: 'jurisdictions' },
        { value: stats.verifiedEvents, label: 'verified events' },
      ]} />

      <div className="mt-3 grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <label className="relative sm:w-60">
              <span className="sr-only">Filter by jurisdiction</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <select
                value={jurisdictionFilter}
                onChange={(event) => setJurisdictionFilter(event.target.value)}
                className="h-11 w-full appearance-none border border-input bg-background pl-10 pr-3 text-sm"
              >
                <option value="all">All jurisdictions</option>
                {Object.entries(JURISDICTION_NAMES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="relative sm:w-60">
              <span className="sr-only">Filter by event type</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="h-11 w-full appearance-none border border-input bg-background pl-10 pr-3 text-sm"
              >
                <option value="all">All event types</option>
                {TIMELINE_EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>{EVENT_TYPE_CONFIG[type].label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
              {filteredEvents.length} of {timelineData.length} events
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-8 items-center gap-1 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <Timeline
            events={filteredEvents}
            onEventClick={(event) => setSelectedEvent(event as TimelineEvent)}
          />
        </div>

        <aside className="border-l border-border pl-6">
          <h2 className="text-sm font-semibold">Legend</h2>
          <div className="mt-3 space-y-2.5">
            {TIMELINE_EVENT_TYPES.map((type) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className={cn('inline-flex h-2 w-2 shrink-0 rounded-full', EVENT_TYPE_CONFIG[type].dot)} />
                {EVENT_TYPE_CONFIG[type].label}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {selectedEvent &&
                formatPolicyDate({
                  type: 'published',
                  date: selectedEvent.date,
                  precision: selectedEvent.datePrecision ?? 'day',
                })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {selectedEvent ? (
                <span className={cn('inline-flex rounded px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]', EVENT_TYPE_CONFIG[selectedEvent.type].tone)}>
                  {EVENT_TYPE_CONFIG[selectedEvent.type].label}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {selectedEvent ? JURISDICTION_NAMES[selectedEvent.jurisdiction] : null}
              </span>
              {selectedEvent ? <SourceState verification={selectedEvent.verification} /> : null}
            </div>

            <p className="text-muted-foreground">{selectedEvent?.description}</p>

            {relatedPolicy && (
              <div className="border border-border bg-muted/50 p-4">
                <p className="text-sm font-semibold">Related policy</p>
                <h4 className="mt-2 text-sm font-medium">{relatedPolicy.title}</h4>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {relatedPolicy.description}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <StatusPill status={relatedPolicy.status} />
                  <span className="text-xs text-muted-foreground">{getPolicyTypeName(relatedPolicy.type)}</span>
                  <Link
                    href={`/policies/${relatedPolicy.id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View policy
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            {selectedEvent?.sourceUrl && (
              <a
                href={selectedEvent.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View source
                <ArrowRight className="h-3 w-3" />
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
