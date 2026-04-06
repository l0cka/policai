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
} from '@/types';

import policiesData from '@/../public/data/sample-policies.json';
import agenciesData from '@/../public/data/sample-agencies.json';

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-700',
  proposed: 'text-amber-600',
  amended: 'text-blue-700',
  repealed: 'text-gray-500',
};

export default function MapPage() {
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<Jurisdiction | null>(null);
  const [hoveredJurisdiction, setHoveredJurisdiction] = useState<Jurisdiction | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate panel in/out when selection changes
  useEffect(() => {
    if (selectedJurisdiction) {
      // Small delay for the spring-in effect
      requestAnimationFrame(() => setPanelVisible(true));
    } else {
      setPanelVisible(false);
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
  }, []);

  const selectedPolicies = useMemo(() => {
    if (!selectedJurisdiction) return [];
    return policiesData.filter((p) => p.jurisdiction === selectedJurisdiction && p.status !== 'trashed');
  }, [selectedJurisdiction]);

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

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden relative">
      {/* Map area — takes full width, panel overlays */}
      <div className="flex-1 relative">
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
        className="absolute top-0 right-0 h-[calc(100vh-4rem)] w-[340px] border-l border-border bg-background z-10 flex flex-col overflow-hidden"
        style={{
          transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {selectedJurisdiction && (
          <>
            {/* Panel header */}
            <div className="p-5 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-sans text-lg font-bold">
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
                  className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                <div className="divide-y divide-border">
                  {selectedPolicies.map((policy, idx) => (
                    <Link
                      key={policy.id}
                      href={`/policies/${policy.id}`}
                      className="block p-4 hover:bg-muted/50 transition-colors"
                      style={{
                        opacity: panelVisible ? 1 : 0,
                        transform: panelVisible ? 'translateX(0)' : 'translateX(20px)',
                        transition: `opacity 0.3s ease ${idx * 0.05 + 0.15}s, transform 0.3s ease ${idx * 0.05 + 0.15}s`,
                      }}
                    >
                      <div className="text-sm font-medium text-primary hover:underline leading-snug">
                        {policy.title}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
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
            <div className="p-4 border-t border-border flex-shrink-0">
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
      <div className="absolute bottom-0 left-0 border-t border-border bg-background/90 backdrop-blur-sm px-5 py-2 z-5" style={{ right: panelVisible ? '340px' : '0', transition: 'right 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <div className="font-mono text-xs text-muted-foreground">
          {policiesData.filter(p => p.status !== 'trashed').length} policies across {Object.keys(jurisdictionData).length} jurisdictions
        </div>
      </div>
    </div>
  );
}
