'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { JURISDICTION_NAMES, type Jurisdiction, type TimelineEvent } from '@/types';
import {
  FileText,
  Edit,
  Trash2,
  Megaphone,
  Flag,
  Circle,
} from 'lucide-react';

interface TimelineProps {
  events: TimelineEvent[];
  selectedJurisdiction?: Jurisdiction | null;
  onEventClick?: (event: TimelineEvent) => void;
}

const eventTypeConfig = {
  policy_introduced: {
    icon: FileText,
    color: 'bg-green-500',
    label: 'Policy Introduced',
  },
  policy_amended: {
    icon: Edit,
    color: 'bg-blue-500',
    label: 'Policy Amended',
  },
  policy_repealed: {
    icon: Trash2,
    color: 'bg-red-500',
    label: 'Policy Repealed',
  },
  announcement: {
    icon: Megaphone,
    color: 'bg-yellow-500',
    label: 'Announcement',
  },
  milestone: {
    icon: Flag,
    color: 'bg-purple-500',
    label: 'Milestone',
  },
};

export function Timeline({ events, selectedJurisdiction, onEventClick }: TimelineProps) {
  // Group events by year
  const eventsByYear = useMemo(() => {
    const filtered = selectedJurisdiction
      ? events.filter((e) => e.jurisdiction === selectedJurisdiction)
      : events;

    const sorted = [...filtered].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const grouped: Record<string, TimelineEvent[]> = {};
    sorted.forEach((event) => {
      const year = new Date(event.date).getFullYear().toString();
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(event);
    });

    return grouped;
  }, [events, selectedJurisdiction]);

  const years = Object.keys(eventsByYear).sort((a, b) => parseInt(b) - parseInt(a));

  if (years.length === 0) {
    return (
      <div className="text-center py-12">
        <Circle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No events found</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-border" />

      {years.map((year) => (
        <div key={year} className="mb-8">
          {/* Year header */}
          <div className="flex items-center mb-4">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold z-10">
              {year.slice(2)}
            </div>
            <span className="ml-4 text-xl font-bold">{year}</span>
          </div>

          {/* Events for this year */}
          <div className="ml-6 border-l-2 border-border pl-8 space-y-6">
            {eventsByYear[year].map((event) => {
              const config = eventTypeConfig[event.type];
              const Icon = config.icon;

              return (
                <div
                  key={event.id}
                  className={cn(
                    'relative group cursor-pointer',
                    onEventClick && 'hover:bg-muted/50 -ml-4 pl-4 py-2 rounded-lg transition-colors'
                  )}
                  onClick={() => onEventClick?.(event)}
                >
                  {/* Event dot */}
                  <div
                    className={cn(
                      'absolute -left-[42px] top-1 h-4 w-4 rounded-full border-2 border-background z-10',
                      config.color
                    )}
                  />

                  {/* Event content */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                      <Badge variant="secondary">
                        {JURISDICTION_NAMES[event.jurisdiction]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(event.date), 'MMMM d, yyyy')}
                      </span>
                    </div>

                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {event.title}
                    </h3>

                    <p className="text-sm text-muted-foreground">{event.description}</p>

                    {event.sourceUrl && (
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View source →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
