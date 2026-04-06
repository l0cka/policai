'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { AustraliaMap } from '@/components/visualizations/AustraliaMap';
import {
  JURISDICTION_NAMES,
  POLICY_STATUS_NAMES,
  POLICY_TYPE_NAMES,
  type Jurisdiction,
  type PolicyStatus,
  type PolicyType,
  type Policy,
} from '@/types';

import { STATUS_COLORS } from '@/lib/design-tokens';

export default function MapPage() {
  const [policiesData, setPoliciesData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<Jurisdiction | null>(null);
  const [, setHoveredJurisdiction] = useState<Jurisdiction | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data
  useEffect(() => {
    fetch('/api/policies')
      .then((res) => res.json())
      .then((json) => setPoliciesData(json.data ?? []))
      .catch((err) => console.error('Failed to load map data:', err))
      .finally(() => setLoading(false));
  }, []);

  // Animate panel in when selection changes
  useEffect(() => {
    if (selectedJurisdiction) {
      // Small delay for the spring-in effect
      requestAnimationFrame(() => setPanelVisible(true));
    }
  }, [selectedJurisdiction]);

  const jurisdictionData = useMemo(() => {
    const data: Record<Jurisdiction, { count: number; active: number }> = {
      federal: { count: 0, active: 0 },
      nsw: { count: 0, active: 0 },
      vic: { count: 0, active: 0 },
      qld: { count: 0, active: 0 },
      wa: { count: 0, active: 0 },
      sa: { count: 0, active: 0 },
      tas: { count: 0, active: 0 },
      act: { count: 0, active: 0 },
      nt: { count: 0, active: 0 },
    };

    policiesData.forEach((policy) => {
      const j = policy.jurisdiction as Jurisdiction;
      if (data[j]) {
        data[j].count++;
        if (policy.status === 'active') data[j].active++;
      }
    });

    return data;
  }, [policiesData]);

  const selectedPolicies = useMemo(() => {
    if (!selectedJurisdiction) return [];
    return policiesData.filter((p) => p.jurisdiction === selectedJurisdiction && p.status !== 'trashed');
  }, [selectedJurisdiction, policiesData]);

  const handleJurisdictionClick = (j: Jurisdiction) => {
    // Clear any pending close timer so a stale timeout can't clear a new selection
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (selectedJurisdiction === j) {
      setPanelVisible(false);
      // Wait for animation out before clearing
      closeTimerRef.current = setTimeout(() => {
        setSelectedJurisdiction(null);
        closeTimerRef.current = null;
      }, 300);
    } else {
      setSelectedJurisdiction(j);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading map data...</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100svh-4rem)] overflow-hidden bg-background">
      {/* Map area — takes full width, panel overlays */}
      <div className="relative flex flex-1 min-w-0 items-start justify-center px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-16">
        <AustraliaMap
          data={jurisdictionData}
          selectedJurisdiction={selectedJurisdiction}
          onJurisdictionClick={handleJurisdictionClick}
          onJurisdictionHover={setHoveredJurisdiction}
        />
      </div>

      {/* Sliding policy panel */}
      <div
        ref={panelRef}
        className={`absolute inset-x-0 bottom-0 z-10 flex max-h-[60vh] flex-col overflow-hidden rounded-t-xl border-t border-border bg-background shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:top-6 md:right-6 md:left-auto md:h-[calc(100%-3rem)] md:max-h-none md:w-[22rem] md:rounded-2xl md:border md:bg-card/95 md:shadow-xl md:backdrop-blur-sm ${
          panelVisible
            ? 'translate-y-0 md:translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full'
        }`}
      >
        {selectedJurisdiction && (
          <>
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center py-2 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            {/* Panel header */}
            <div className="flex-shrink-0 border-b border-border bg-muted/30 p-5 md:p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-sans text-xl font-bold tracking-tight">
                  {JURISDICTION_NAMES[selectedJurisdiction]}
                </h2>
                <button
                  onClick={() => {
                    if (closeTimerRef.current) {
                      clearTimeout(closeTimerRef.current);
                      closeTimerRef.current = null;
                    }
                    setPanelVisible(false);
                    closeTimerRef.current = setTimeout(() => {
                      setSelectedJurisdiction(null);
                      closeTimerRef.current = null;
                    }, 300);
                  }}
                  className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {jurisdictionData[selectedJurisdiction].count} policies
                {' \u00b7 '}
                {jurisdictionData[selectedJurisdiction].active} active
              </div>
            </div>

            {/* Policy list */}
            <div className="flex-1 overflow-y-auto">
              {selectedPolicies.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground">
                  No policies found for this jurisdiction.
                </div>
              ) : (
                <div className="divide-y divide-border/80">
                  {selectedPolicies.map((policy, idx) => (
                    <Link
                      key={policy.id}
                      href={`/policies/${policy.id}`}
                      className="block p-4 transition-colors hover:bg-muted/40 md:px-6 md:py-5"
                      style={{
                        opacity: panelVisible ? 1 : 0,
                        transform: panelVisible ? 'translateX(0)' : 'translateX(20px)',
                        transition: `opacity 0.3s ease ${idx * 0.05 + 0.15}s, transform 0.3s ease ${idx * 0.05 + 0.15}s`,
                      }}
                    >
                      <div className="text-base font-medium leading-snug text-foreground">
                        {policy.title}
                      </div>
                      <div className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                        <span className={STATUS_COLORS[policy.status] || 'text-muted-foreground'}>
                          {POLICY_STATUS_NAMES[policy.status as PolicyStatus]}
                        </span>
                        <span>&middot;</span>
                        <span>{POLICY_TYPE_NAMES[policy.type as PolicyType]}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div className="flex-shrink-0 border-t border-border bg-muted/20 p-4 md:px-6">
              <Link
                href="/"
                className="font-mono text-xs text-primary hover:underline"
              >
                View all policies &rarr;
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Bottom summary bar */}
      <div
        className={`absolute right-0 bottom-0 left-0 border-t border-border bg-background/90 px-5 py-2 backdrop-blur-sm transition-[right] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          panelVisible ? 'md:right-[calc(22rem+1.5rem)]' : 'md:right-0'
        }`}
      >
        <div className="font-mono text-xs text-muted-foreground" aria-live="polite">
          {policiesData.filter(p => p.status !== 'trashed').length} policies across {Object.keys(jurisdictionData).length} jurisdictions
          {selectedJurisdiction && (
            <span> &middot; Viewing {JURISDICTION_NAMES[selectedJurisdiction]}</span>
          )}
        </div>
      </div>
    </div>
  );
}
