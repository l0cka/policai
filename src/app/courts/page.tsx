'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { ExternalLink, Scale, ChevronDown, ChevronRight } from 'lucide-react';
import {
  JURISDICTION_NAMES,
  POLICY_STATUS_NAMES,
  type Policy,
  type Jurisdiction,
  type PolicyStatus,
} from '@/types';
import { STATUS_COLORS } from '@/lib/design-tokens';

/** Group practice notes by jurisdiction, ordered with federal first. */
const JURISDICTION_ORDER: Jurisdiction[] = [
  'federal',
  'nsw',
  'vic',
  'qld',
  'wa',
  'sa',
  'tas',
  'act',
  'nt',
];

interface CourtNote extends Policy {
  courtName: string;
}

function extractCourtName(policy: Policy): string {
  return policy.agencies[0] || 'Unknown Court';
}

export default function CourtsPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/policies')
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((json) => setPolicies(json.data ?? []))
      .catch((err) => {
        console.error('Failed to load policies:', err);
        setError('Unable to load court practice notes. Please try refreshing the page.');
      })
      .finally(() => setLoading(false));
  }, []);

  const practiceNotes: CourtNote[] = useMemo(() => {
    return policies
      .filter((p) => p.type === 'practice_note' && p.status !== 'trashed')
      .map((p) => ({ ...p, courtName: extractCourtName(p) }));
  }, [policies]);

  const grouped = useMemo(() => {
    const map = new Map<Jurisdiction, CourtNote[]>();
    for (const note of practiceNotes) {
      const list = map.get(note.jurisdiction) || [];
      list.push(note);
      map.set(note.jurisdiction, list);
    }
    // Sort each group by effective date descending
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
    }
    return map;
  }, [practiceNotes]);

  const jurisdictionsWithNotes = JURISDICTION_ORDER.filter((j) => grouped.has(j));
  const jurisdictionsWithout = JURISDICTION_ORDER.filter((j) => !grouped.has(j));

  const formatDate = (d: string | Date) => {
    if (!d) return '\u2014';
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading court practice notes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="font-mono text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-screen-lg">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Courts &amp; Tribunals
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Practice notes, practice directions, and guidelines issued by Australian courts and tribunals
          governing the use of AI in proceedings. These instruments operate at the level of procedural
          rules and directly affect how AI may be used when interacting with the judiciary.
        </p>
      </div>

      {/* Summary stats */}
      <div className="flex gap-6 mb-8 font-mono text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{practiceNotes.length}</span> practice notes
        </span>
        <span>
          <span className="font-semibold text-foreground">{jurisdictionsWithNotes.length}</span> jurisdictions
        </span>
        <span>
          <span className="font-semibold text-foreground">{jurisdictionsWithout.length}</span> pending
        </span>
      </div>

      {/* Jurisdictions with practice notes */}
      {jurisdictionsWithNotes.map((jurisdiction) => {
        const notes = grouped.get(jurisdiction)!;
        return (
          <section key={jurisdiction} className="mb-8">
            <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Scale className="h-3.5 w-3.5" />
              {JURISDICTION_NAMES[jurisdiction]}
              <span className="text-muted-foreground/60">({notes.length})</span>
            </h2>

            <div className="border-t-2 border-foreground">
              {notes.map((note) => {
                const isExpanded = expandedId === note.id;
                return (
                  <div
                    key={note.id}
                    className="border-b border-border/30 transition-colors hover:bg-[var(--row-hover)]"
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : note.id)}
                      className="w-full text-left py-3 px-1 flex items-start gap-3"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {note.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {note.courtName}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className={`text-xs font-medium ${STATUS_COLORS[note.status] || 'text-muted-foreground'}`}>
                              {POLICY_STATUS_NAMES[note.status as PolicyStatus] || note.status}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground hidden sm:block">
                              {formatDate(note.effectiveDate)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="pl-8 pr-4 pb-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {note.description}
                        </p>

                        {note.aiSummary && (
                          <div>
                            <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
                              Summary
                            </span>
                            <p className="text-sm text-muted-foreground mt-1">
                              {note.aiSummary}
                            </p>
                          </div>
                        )}

                        {/* Key requirements */}
                        {note.content && (
                          <div>
                            <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
                              Key Details
                            </span>
                            <p className="text-sm text-muted-foreground mt-1">
                              {note.content}
                            </p>
                          </div>
                        )}

                        {/* Tags */}
                        {note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {note.tags
                              .filter((t) => t !== 'courts' && t !== 'judicial')
                              .map((tag) => (
                                <span
                                  key={tag}
                                  className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 bg-muted rounded text-muted-foreground"
                                >
                                  {tag}
                                </span>
                              ))}
                          </div>
                        )}

                        {/* Links */}
                        <div className="flex items-center gap-4 pt-1">
                          <Link
                            href={`/policies/${note.id}`}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            View full entry
                          </Link>
                          {note.sourceUrl && (
                            <a
                              href={note.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                            >
                              Source document
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Jurisdictions without practice notes */}
      {jurisdictionsWithout.length > 0 && (
        <section className="mt-10">
          <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            No practice notes yet
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {jurisdictionsWithout.map((j) => (
              <div
                key={j}
                className="px-3 py-2 border border-dashed border-border rounded text-sm text-muted-foreground"
              >
                {JURISDICTION_NAMES[j]}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-3">
            These jurisdictions have not yet issued public AI practice notes for their courts.
            This tracker updates as new instruments are published.
          </p>
        </section>
      )}
    </div>
  );
}
