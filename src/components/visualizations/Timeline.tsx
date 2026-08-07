'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  formatPolicyDate,
  parseCalendarDateForDisplay,
} from '@/lib/format-policy-date';
import { JurisdictionMark, SourceState } from '@/components/policy-table';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import { type Jurisdiction, type TimelineEvent, type TimelineEventType } from '@/types';
import { ArrowUpRight } from 'lucide-react';

interface TimelineProps {
  events: TimelineEvent[];
  selectedJurisdiction?: Jurisdiction | null;
  onEventClick?: (event: TimelineEvent) => void;
}

/**
 * Event-type labels and tones, reusing the same status token pairs as the
 * register: `tone` is the subdued badge fill, `dot` is the same colour at
 * full strength for the legend swatch.
 */
export const EVENT_TYPE_CONFIG: Record<TimelineEventType, { label: string; tone: string; dot: string }> = {
  policy_introduced: { label: 'Introduced', tone: 'bg-[var(--status-active-bg)] text-[var(--status-active)]', dot: 'bg-[var(--status-active)]' },
  policy_amended: { label: 'Amended', tone: 'bg-[var(--status-amended-bg)] text-[var(--status-amended)]', dot: 'bg-[var(--status-amended)]' },
  policy_repealed: { label: 'Repealed', tone: 'bg-[var(--status-repealed-bg)] text-[var(--status-repealed)]', dot: 'bg-[var(--status-repealed)]' },
  policy_superseded: { label: 'Superseded', tone: 'bg-[var(--status-repealed-bg)] text-[var(--status-repealed)]', dot: 'bg-[var(--status-repealed)]' },
  announcement: { label: 'Announcement', tone: 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]', dot: 'bg-[var(--status-proposed)]' },
  milestone: { label: 'Milestone', tone: 'bg-accent text-primary', dot: 'bg-primary' },
};

export function Timeline({ events, selectedJurisdiction, onEventClick }: TimelineProps) {
  const eventsByYear = useMemo(() => {
    const filtered = selectedJurisdiction
      ? events.filter((e) => e.jurisdiction === selectedJurisdiction)
      : events;

    const sorted = [...filtered].sort(
      (a, b) =>
        parseCalendarDateForDisplay(b.date).getTime() -
        parseCalendarDateForDisplay(a.date).getTime(),
    );

    const grouped = new Map<string, TimelineEvent[]>();
    for (const event of sorted) {
      const year = parseCalendarDateForDisplay(event.date).getFullYear().toString();
      grouped.set(year, [...(grouped.get(year) ?? []), event]);
    }
    return grouped;
  }, [events, selectedJurisdiction]);

  const years = Array.from(eventsByYear.keys()).sort((a, b) => Number(b) - Number(a));

  if (years.length === 0) {
    return (
      <div className="border-y border-border py-14 text-center">
        <p className="section-title">No matching events</p>
        <p className="mt-2 text-sm text-muted-foreground">Try a broader search or jurisdiction.</p>
      </div>
    );
  }

  return (
    <div>
      {years.map((year) => (
        <section key={year} className="mb-4">
          <h2 className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
            {year}
          </h2>
          <div>
            {eventsByYear.get(year)!.map((event) => {
              const config = EVENT_TYPE_CONFIG[event.type];
              return (
                <article
                  key={event.id}
                  style={jurisdictionRailStyle(event.jurisdiction)}
                  onClick={() => onEventClick?.(event)}
                  className="ink-rail content-auto group grid cursor-pointer gap-2 border-b border-border py-4 pl-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)] sm:grid-cols-[6.5rem_7rem_minmax(0,1fr)] lg:grid-cols-[6.5rem_7rem_minmax(0,1fr)_9rem_9rem]"
                >
                  <time className="font-mono text-[10px] uppercase text-muted-foreground">
                    {formatPolicyDate(
                      { type: 'published', date: event.date, precision: event.datePrecision ?? 'day' },
                      { short: true },
                    )}
                  </time>
                  <div>
                    <span className={cn('inline-flex rounded px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]', config.tone)}>
                      {config.label}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 group-hover:text-primary">{event.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{event.description}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground lg:hidden">
                      <JurisdictionMark jurisdiction={event.jurisdiction} />
                    </p>
                  </div>
                  <div className="hidden text-xs leading-5 text-muted-foreground lg:block">
                    <JurisdictionMark jurisdiction={event.jurisdiction} />
                  </div>
                  <div className="hidden lg:block">
                    <SourceState verification={event.verification} />
                    {event.sourceUrl ? (
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Source <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
