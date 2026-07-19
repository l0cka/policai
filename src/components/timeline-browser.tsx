'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Filter, ArrowRight, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Timeline } from '@/components/visualizations/Timeline';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { parseCalendarDateForDisplay } from '@/lib/format-policy-date';
import {
  JURISDICTION_NAMES,
  getPolicyTypeName,
  type Policy,
  type TimelineEvent,
} from '@/types';
import { MetricStrip, PageIntro } from '@/components/layout';

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

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Policy timeline"
        description={
          <p>
          Track the evolution of Australian AI policy through source-linked
          events. Each event carries its editorial verification state.
          </p>
        }
      />

      <MetricStrip metrics={[
        { value: stats.totalEvents, label: 'events' },
        { value: stats.years, label: 'years covered' },
        { value: stats.jurisdictions, label: 'jurisdictions' },
        { value: stats.verifiedEvents, label: 'verified events' },
      ]} />

      <div className="mt-8 grid gap-8 lg:grid-cols-4">
        {/* Filters Sidebar */}
        <div className="space-y-4 lg:col-span-1 lg:sticky lg:top-24 lg:self-start">
          <Card className="rounded-none border-border bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Jurisdiction</label>
                <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Jurisdictions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Jurisdictions</SelectItem>
                    {Object.entries(JURISDICTION_NAMES).map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Event Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="policy_introduced">Policy Introduced</SelectItem>
                    <SelectItem value="policy_amended">Policy Amended</SelectItem>
                    <SelectItem value="policy_repealed">Policy Repealed</SelectItem>
                    <SelectItem value="policy_superseded">Policy Superseded</SelectItem>
                    <SelectItem value="announcement">Announcement</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredEvents.length} of {timelineData.length} events
                </p>
              </div>

              {(jurisdictionFilter !== 'all' || typeFilter !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setJurisdictionFilter('all');
                    setTypeFilter('all');
                  }}
                  className="w-full"
                >
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="rounded-none border-border bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm">Policy Introduced</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm">Policy Amended</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm">Policy Repealed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="text-sm">Announcement</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="text-sm">Milestone</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <div className="lg:col-span-3">
          <Card className="rounded-none border-border bg-card/35 shadow-none">
            <CardHeader className="pb-4">
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Click on an event to see more details</CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline
                events={filteredEvents}
                onEventClick={(event) => setSelectedEvent(event as TimelineEvent)}
              />
            </CardContent>
          </Card>
        </div>
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
            <div className="flex gap-2">
              <Badge variant="secondary">
                {selectedEvent && JURISDICTION_NAMES[selectedEvent.jurisdiction]}
              </Badge>
              <Badge variant="outline">
                {selectedEvent?.type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </Badge>
              <Badge
                variant={
                  selectedEvent?.verification.status === 'verified'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {selectedEvent?.verification.status === 'verified'
                  ? 'Verified'
                  : 'Needs review'}
              </Badge>
            </div>

            <p className="text-muted-foreground">{selectedEvent?.description}</p>

            {relatedPolicy && (
              <Card className="bg-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Related Policy</CardTitle>
                </CardHeader>
                <CardContent>
                  <h4 className="font-medium">{relatedPolicy.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {relatedPolicy.description}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Badge variant="secondary">
                      {getPolicyTypeName(relatedPolicy.type)}
                    </Badge>
                    <Link
                      href={`/policies/${relatedPolicy.id}`}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View Policy
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedEvent?.sourceUrl && (
              <a
                href={selectedEvent.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
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
