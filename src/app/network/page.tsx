'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Network, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ForceGraph } from '@/components/network/ForceGraph';
import { NetworkToolbar } from '@/components/network/NetworkToolbar';
import { NetworkSidebar } from '@/components/network/NetworkSidebar';
import { JURISDICTION_COLORS, resolveColor } from '@/components/network/jurisdiction-colors';
import { JURISDICTION_NAMES, type Jurisdiction } from '@/types';
import type { NetworkNode, NetworkEdge } from '@/app/api/network/route';

export default function NetworkPage() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [edges, setEdges] = useState<NetworkEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeJurisdictions, setActiveJurisdictions] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/network');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setNodes(json.nodes);
      setEdges(json.edges);
      // Initialize all jurisdictions as active
      const jurisdictions = new Set<string>(json.nodes.map((n: NetworkNode) => n.jurisdiction));
      setActiveJurisdictions(jurisdictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load network data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Jurisdiction info for toolbar
  const jurisdictionInfo = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      counts[node.jurisdiction] = (counts[node.jurisdiction] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: JURISDICTION_NAMES[key as Jurisdiction] || key,
        color: resolveColor(JURISDICTION_COLORS[key] || 'var(--chart-1)'),
        count,
      }));
  }, [nodes]);

  const toggleJurisdiction = useCallback((key: string) => {
    setActiveJurisdictions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Selected policy and its connections
  const selectedPolicy = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const connectedPolicies = useMemo(() => {
    if (!selectedNodeId) return [];
    const connected: { id: string; title: string; jurisdiction: string }[] = [];
    for (const edge of edges) {
      if (edge.source === selectedNodeId) {
        const target = nodes.find((n) => n.id === edge.target);
        if (target) connected.push({ id: target.id, title: target.title, jurisdiction: target.jurisdiction });
      } else if (edge.target === selectedNodeId) {
        const source = nodes.find((n) => n.id === edge.source);
        if (source) connected.push({ id: source.id, title: source.title, jurisdiction: source.jurisdiction });
      }
    }
    return connected;
  }, [selectedNodeId, edges, nodes]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted-foreground border-t-foreground" />
        <p className="text-sm text-muted-foreground">Loading network...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Failed to load network data</p>
        <p className="text-xs text-muted-foreground/60">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-3 w-3 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Empty state
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-4">
        <Network className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No policies found</p>
        <Link href="/" className="text-xs text-primary hover:underline">
          Browse policies →
        </Link>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden">
      <NetworkToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        jurisdictions={jurisdictionInfo}
        activeJurisdictions={activeJurisdictions}
        onToggleJurisdiction={toggleJurisdiction}
        totalPolicies={nodes.length}
      />

      <ForceGraph
        nodes={nodes}
        edges={edges}
        searchQuery={searchQuery}
        activeJurisdictions={activeJurisdictions}
        selectedNodeId={selectedNodeId}
        onNodeClick={setSelectedNodeId}
      />

      <NetworkSidebar
        policy={selectedPolicy}
        connectedPolicies={connectedPolicies}
        onClose={() => setSelectedNodeId(null)}
        onNavigateToNode={setSelectedNodeId}
      />

      {/* Partial data note */}
      {edges.length === 0 && nodes.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur border border-border rounded-lg px-4 py-2 text-xs text-muted-foreground">
          No cross-policy connections found yet — policies may not share enough tags
        </div>
      )}
    </div>
  );
}
