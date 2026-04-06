'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Filter,
  FileText,
  Building2,
  Map,
  ExternalLink,
  Info,
  Search,
  X,
  Network,
  GitBranch,
  BarChart3,
} from 'lucide-react';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  type Jurisdiction,
  type PolicyType,
  type PolicyStatus,
  type Policy,
  type Agency,
} from '@/types';

type NodeType = 'policy' | 'agency' | 'jurisdiction';

interface NodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  status?: string;
  policyType?: string;
  originalData: Policy | Agency | { jurisdiction: Jurisdiction };
}

// Improved layout algorithm with hierarchical positioning grouped by jurisdiction
function generateGraphData(
  filterJurisdiction: string,
  filterStatus: string,
  filterType: string,
  searchQuery: string,
  policiesData: Policy[],
  agenciesData: Agency[],
) {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];

  // Filter policies
  const filteredPolicies = policiesData.filter((p) => {
    const matchesJurisdiction = filterJurisdiction === 'all' || p.jurisdiction === filterJurisdiction;
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesType = filterType === 'all' || p.type === filterType;
    const matchesSearch =
      searchQuery === '' ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesJurisdiction && matchesStatus && matchesType && matchesSearch;
  });

  // Get unique agencies from filtered policies
  const policyAgencyIds = new Set<string>();
  filteredPolicies.forEach((p) => {
    p.agencies.forEach((agencyId) => policyAgencyIds.add(agencyId.toLowerCase()));
  });

  // Filter agencies - match by id or acronym
  const filteredAgencies = agenciesData.filter((a) => {
    const matchesJurisdiction = filterJurisdiction === 'all' || a.jurisdiction === filterJurisdiction;
    const isReferencedByPolicy =
      policyAgencyIds.has(a.id.toLowerCase()) ||
      policyAgencyIds.has(a.acronym.toLowerCase()) ||
      policyAgencyIds.has(a.name.toLowerCase());
    return matchesJurisdiction && (isReferencedByPolicy || filterJurisdiction !== 'all');
  });

  // Get relevant jurisdictions
  const relevantJurisdictions =
    filterJurisdiction === 'all'
      ? [...new Set([...filteredPolicies.map((p) => p.jurisdiction), ...filteredAgencies.map((a) => a.jurisdiction)])]
      : [filterJurisdiction];

  // Group agencies and policies by jurisdiction for better layout
  const agenciesByJurisdiction: Record<string, typeof filteredAgencies> = {};
  const policiesByJurisdiction: Record<string, typeof filteredPolicies> = {};

  relevantJurisdictions.forEach((j) => {
    agenciesByJurisdiction[j] = filteredAgencies.filter((a) => a.jurisdiction === j);
    policiesByJurisdiction[j] = filteredPolicies.filter((p) => p.jurisdiction === j);
  });

  // Layout constants
  const nodeHeight = 50;
  const nodeGap = 25;
  const jurisdictionGap = 60;
  const columnGap = 250;

  const styles = {
    jurisdictionBg: 'var(--network-jurisdiction-bg)',
    jurisdictionBorder: 'var(--network-jurisdiction-border)',
    agencyBg: 'var(--network-agency-bg)',
    agencyForeground: 'var(--network-agency-foreground)',
    agencyBorder: 'var(--network-agency-border)',
    activeBg: 'var(--network-active-bg)',
    activeBorder: 'var(--network-active-border)',
    proposedBg: 'var(--network-proposed-bg)',
    proposedBorder: 'var(--network-proposed-border)',
    amendedBg: 'var(--network-amended-bg)',
    amendedBorder: 'var(--network-amended-border)',
    defaultBg: 'var(--network-default-bg)',
    defaultBorder: 'var(--network-default-border)',
    edge: 'var(--network-edge)',
  };

  // Get policy status colors
  const getStatusColors = (status: string) => {
    switch (status) {
      case 'active':
        return { bg: styles.activeBg, border: styles.activeBorder };
      case 'proposed':
        return { bg: styles.proposedBg, border: styles.proposedBorder };
      case 'amended':
        return { bg: styles.amendedBg, border: styles.amendedBorder };
      default:
        return { bg: styles.defaultBg, border: styles.defaultBorder };
    }
  };

  let currentY = 50;

  // Position nodes grouped by jurisdiction
  relevantJurisdictions.forEach((jurisdiction) => {
    const agencies = agenciesByJurisdiction[jurisdiction] || [];
    const policies = policiesByJurisdiction[jurisdiction] || [];

    // Calculate the height needed for this jurisdiction group
    const agencyHeight = Math.max(agencies.length, 1) * (nodeHeight + nodeGap);
    const policyHeight = Math.max(policies.length, 1) * (nodeHeight + nodeGap);
    const groupHeight = Math.max(agencyHeight, policyHeight, nodeHeight + nodeGap);

    // Center the jurisdiction node vertically in its group
    const jurisdictionY = currentY + groupHeight / 2 - nodeHeight / 2;

    // Add jurisdiction node
    nodes.push({
      id: `jurisdiction-${jurisdiction}`,
      type: 'default',
      position: { x: 50, y: jurisdictionY },
      data: {
        label: JURISDICTION_NAMES[jurisdiction as Jurisdiction] || jurisdiction,
        type: 'jurisdiction',
        originalData: { jurisdiction: jurisdiction as Jurisdiction },
      },
      style: {
        background: styles.jurisdictionBg,
        color: 'white',
        border: `2px solid ${styles.jurisdictionBorder}`,
        borderRadius: '12px',
        padding: '12px 20px',
        fontWeight: 600,
        fontSize: '13px',
        width: 160,
        boxShadow: `0 4px 12px color-mix(in srgb, ${styles.jurisdictionBorder} 35%, transparent)`,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    // Add agency nodes for this jurisdiction
    agencies.forEach((agency, index) => {
      const agencyY = currentY + index * (nodeHeight + nodeGap);
      nodes.push({
        id: `agency-${agency.id}`,
        type: 'default',
        position: { x: 50 + columnGap, y: agencyY },
        data: {
          label: agency.acronym || agency.name.substring(0, 15),
          type: 'agency',
          originalData: agency,
        },
        style: {
          background: styles.agencyBg,
          color: styles.agencyForeground,
          border: `2px solid ${styles.agencyBorder}`,
          borderRadius: '10px',
          padding: '10px 16px',
          fontWeight: 500,
          fontSize: '12px',
          width: 130,
          boxShadow: `0 4px 12px color-mix(in srgb, ${styles.agencyBorder} 28%, transparent)`,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Connect agency to jurisdiction
      edges.push({
        id: `edge-${agency.id}-${agency.jurisdiction}`,
        source: `jurisdiction-${agency.jurisdiction}`,
        target: `agency-${agency.id}`,
        type: 'smoothstep',
        animated: false,
        style: { stroke: styles.edge, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: styles.edge, width: 12, height: 12 },
      });
    });

    // Add policy nodes for this jurisdiction
    policies.forEach((policy, index) => {
      const policyY = currentY + index * (nodeHeight + nodeGap);
      const colors = getStatusColors(policy.status);

      nodes.push({
        id: `policy-${policy.id}`,
        type: 'default',
        position: { x: 50 + columnGap * 2, y: policyY },
        data: {
          label: policy.title.length > 30 ? policy.title.substring(0, 30) + '...' : policy.title,
          type: 'policy',
          status: policy.status,
          policyType: policy.type,
          originalData: policy,
        },
        style: {
          background: colors.bg,
          color: 'white',
          border: `2px solid ${colors.border}`,
          borderRadius: '10px',
          padding: '10px 14px',
          width: 220,
          fontSize: '11px',
          fontWeight: 500,
          boxShadow: `0 4px 12px ${colors.border}40`,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Connect policy to its agencies within this jurisdiction
      policy.agencies.forEach((agencyRef) => {
        const agency = filteredAgencies.find(
          (a) =>
            a.id.toLowerCase() === agencyRef.toLowerCase() ||
            a.acronym.toLowerCase() === agencyRef.toLowerCase() ||
            a.name.toLowerCase() === agencyRef.toLowerCase()
        );

        if (agency) {
          edges.push({
            id: `edge-policy-${policy.id}-${agency.id}`,
            source: `agency-${agency.id}`,
            target: `policy-${policy.id}`,
            type: 'smoothstep',
            animated: policy.status === 'active',
            style: {
              stroke: policy.status === 'active' ? styles.activeBorder : styles.edge,
              strokeWidth: policy.status === 'active' ? 2 : 1.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: policy.status === 'active' ? styles.activeBorder : styles.edge,
              width: 12,
              height: 12,
            },
          });
        }
      });
    });

    // Move to next jurisdiction group
    currentY += groupHeight + jurisdictionGap;
  });

  return { nodes, edges };
}

// Statistics calculation
function calculateStats(
  filterJurisdiction: string,
  filterStatus: string,
  filterType: string,
  searchQuery: string,
  policiesData: Policy[],
) {
  const filteredPolicies = policiesData.filter((p) => {
    const matchesJurisdiction = filterJurisdiction === 'all' || p.jurisdiction === filterJurisdiction;
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesType = filterType === 'all' || p.type === filterType;
    const matchesSearch =
      searchQuery === '' ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesJurisdiction && matchesStatus && matchesType && matchesSearch;
  });

  const activePolicies = filteredPolicies.filter((p) => p.status === 'active').length;
  const proposedPolicies = filteredPolicies.filter((p) => p.status === 'proposed').length;
  const jurisdictions = new Set(filteredPolicies.map((p) => p.jurisdiction)).size;

  return {
    totalPolicies: filteredPolicies.length,
    activePolicies,
    proposedPolicies,
    jurisdictions,
  };
}

export default function NetworkPage() {
  const [policiesData, setPoliciesData] = useState<Policy[]>([]);
  const [agenciesData, setAgenciesData] = useState<Agency[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filterJurisdiction, setFilterJurisdiction] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/policies').then((r) => r.json()),
      fetch('/api/agencies').then((r) => r.json()),
    ])
      .then(([policiesJson, agenciesJson]) => {
        setPoliciesData(policiesJson.data ?? []);
        setAgenciesData(agenciesJson.data ?? []);
      })
      .catch((err) => console.error('Failed to load network data:', err))
      .finally(() => setDataLoading(false));
  }, []);

  // Generate graph data based on filters
  const { nodes: graphNodes, edges: graphEdges } = useMemo(
    () => generateGraphData(filterJurisdiction, filterStatus, filterType, searchQuery, policiesData, agenciesData),
    [filterJurisdiction, filterStatus, filterType, searchQuery, policiesData, agenciesData]
  );

  // Calculate statistics
  const stats = useMemo(
    () => calculateStats(filterJurisdiction, filterStatus, filterType, searchQuery, policiesData),
    [filterJurisdiction, filterStatus, filterType, searchQuery, policiesData]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  // Update nodes and edges when filters change
  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<NodeData>) => {
    setSelectedNode(node);
  }, []);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node<NodeData>) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const clearFilters = () => {
    setFilterJurisdiction('all');
    setFilterStatus('all');
    setFilterType('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    filterJurisdiction !== 'all' || filterStatus !== 'all' || filterType !== 'all' || searchQuery !== '';

  // Highlight connected edges on hover - subtle effect
  const highlightedEdges = useMemo(() => {
    if (!hoveredNode) return edges;
    return edges.map((edge) => {
      const isConnected = edge.source === hoveredNode || edge.target === hoveredNode;
      return {
        ...edge,
        style: {
          ...edge.style,
          strokeWidth: isConnected ? 3 : edge.style?.strokeWidth,
          opacity: isConnected ? 1 : 0.6,
        },
      };
    });
  }, [edges, hoveredNode]);

  // Highlight connected nodes on hover - subtle effect without aggressive fading
  const highlightedNodes = useMemo(() => {
    if (!hoveredNode) return nodes;
    const connectedNodeIds = new Set<string>();
    connectedNodeIds.add(hoveredNode);
    edges.forEach((edge) => {
      if (edge.source === hoveredNode) connectedNodeIds.add(edge.target);
      if (edge.target === hoveredNode) connectedNodeIds.add(edge.source);
    });

    return nodes.map((node) => {
      const isConnected = connectedNodeIds.has(node.id);
      const isHovered = node.id === hoveredNode;
      return {
        ...node,
        style: {
          ...node.style,
          opacity: isConnected ? 1 : 0.75,
          filter: isHovered ? 'brightness(1.1)' : undefined,
          boxShadow: isHovered
            ? '0 0 20px rgba(99, 102, 241, 0.5), 0 4px 12px rgba(0,0,0,0.3)'
            : node.style?.boxShadow,
        },
      };
    });
  }, [nodes, edges, hoveredNode]);

  // MiniMap node color function
  const nodeColor = (node: Node<NodeData>) => {
    switch (node.data.type) {
      case 'jurisdiction':
        return 'var(--network-jurisdiction-border)';
      case 'agency':
        return 'var(--network-agency-border)';
      case 'policy':
        return node.data.status === 'active'
          ? 'var(--network-active-border)'
          : node.data.status === 'proposed'
            ? 'var(--network-proposed-border)'
            : node.data.status === 'amended'
              ? 'var(--network-amended-border)'
              : 'var(--network-default-border)';
      default:
        return 'var(--network-default-border)';
    }
  };

  if (dataLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8 md:py-10">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Loading network data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 md:py-10">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <Network className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Relationship Network</h1>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Visualise connections between AI policies, government agencies, and jurisdictions across Australia
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-indigo-500/15 bg-indigo-500/5 shadow-sm dark:border-indigo-400/20 dark:bg-indigo-400/10">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20">
                <Map className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.jurisdictions}</div>
                <p className="text-xs text-muted-foreground">Jurisdictions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/15 bg-green-500/5 shadow-sm dark:border-green-400/20 dark:bg-green-400/10">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.activePolicies}</div>
                <p className="text-xs text-muted-foreground">Active Policies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/15 bg-amber-500/5 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <GitBranch className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.proposedPolicies}</div>
                <p className="text-xs text-muted-foreground">Proposed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/15 bg-purple-500/5 shadow-sm dark:border-purple-400/20 dark:bg-purple-400/10">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.totalPolicies}</div>
                <p className="text-xs text-muted-foreground">Total Policies</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar: Filters & Legend */}
        <div className="space-y-4 lg:col-span-1 lg:sticky lg:top-24 lg:self-start">
          {/* Search */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Input
                  placeholder="Search policies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Jurisdiction</label>
                <Select value={filterJurisdiction} onValueChange={setFilterJurisdiction}>
                  <SelectTrigger className="h-9">
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
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Status</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.entries(POLICY_STATUS_NAMES).map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Type</label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(POLICY_TYPE_NAMES).map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
                  <X className="h-3 w-3 mr-1" />
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Legend
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-8 rounded"
                  style={{ background: 'var(--network-jurisdiction-bg)' }}
                />
                <span className="text-xs">Jurisdiction</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-8 rounded"
                  style={{ background: 'var(--network-agency-bg)' }}
                />
                <span className="text-xs">Agency</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-8 rounded"
                  style={{ background: 'var(--network-active-bg)' }}
                />
                <span className="text-xs">Active Policy</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-8 rounded"
                  style={{ background: 'var(--network-proposed-bg)' }}
                />
                <span className="text-xs">Proposed Policy</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-8 rounded"
                  style={{ background: 'var(--network-amended-bg)' }}
                />
                <span className="text-xs">Amended Policy</span>
              </div>
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-0.5 w-8 bg-green-500 rounded animate-pulse" />
                  <span className="text-xs">Active Connection</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-8 bg-slate-400 rounded" />
                  <span className="text-xs">Connection</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How to Use */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Controls</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <p>• Drag to pan the view</p>
              <p>• Scroll to zoom in/out</p>
              <p>• Click nodes for details</p>
              <p>• Hover to highlight connections</p>
              <p>• Drag nodes to rearrange</p>
              <p>• Use minimap for navigation</p>
            </CardContent>
          </Card>
        </div>

        {/* Network Graph */}
        <div className="lg:col-span-3">
          <Card className="h-[440px] overflow-hidden shadow-sm lg:h-[700px]">
            <CardContent className="p-0 h-full">
              {highlightedNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <Network className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Results Found</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Try adjusting your filters or search query to see the network graph.
                  </p>
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear All Filters
                  </Button>
                </div>
              ) : (
                <ReactFlow
                  nodes={highlightedNodes}
                  edges={highlightedEdges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={onNodeClick}
                  onNodeMouseEnter={onNodeMouseEnter}
                  onNodeMouseLeave={onNodeMouseLeave}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  attributionPosition="bottom-left"
                  minZoom={0.3}
                  maxZoom={2}
                  defaultEdgeOptions={{
                    type: 'smoothstep',
                  }}
                >
                  <Controls showInteractive={false} />
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
                  <MiniMap
                    nodeColor={nodeColor}
                    maskColor="var(--network-minimap-mask)"
                    className="bg-background/80 backdrop-blur-sm border border-border rounded-lg"
                    position="bottom-right"
                  />
                </ReactFlow>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Node Detail Dialog */}
      <Dialog open={!!selectedNode} onOpenChange={() => setSelectedNode(null)}>
        <DialogContent className="max-w-lg">
          {selectedNode?.data.type === 'policy' && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Policy Details</DialogTitle>
                    <DialogDescription className="text-xs">View policy information</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <ScrollArea className="max-h-[400px] mt-4">
                <div className="space-y-4">
                  <h3 className="font-semibold">
                    {(selectedNode.data.originalData as Policy).title}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={
                        (selectedNode.data.originalData as Policy).status === 'active'
                          ? 'default'
                          : 'secondary'
                      }
                      className={
                        (selectedNode.data.originalData as Policy).status === 'active'
                          ? 'bg-[var(--status-active)] hover:opacity-90 text-background'
                          : ''
                      }
                    >
                      {
                        POLICY_STATUS_NAMES[
                          (selectedNode.data.originalData as Policy).status as PolicyStatus
                        ]
                      }
                    </Badge>
                    <Badge variant="outline">
                      {
                        POLICY_TYPE_NAMES[
                          (selectedNode.data.originalData as Policy).type as PolicyType
                        ]
                      }
                    </Badge>
                    <Badge variant="secondary">
                      {
                        JURISDICTION_NAMES[
                          (selectedNode.data.originalData as Policy).jurisdiction as Jurisdiction
                        ]
                      }
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {(selectedNode.data.originalData as Policy).description}
                  </p>
                  {(selectedNode.data.originalData as Policy).aiSummary && (
                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="text-sm font-medium mb-2">AI Summary</h4>
                      <p className="text-sm text-muted-foreground">
                        {(selectedNode.data.originalData as Policy).aiSummary}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(selectedNode.data.originalData as Policy).tags?.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  {(selectedNode.data.originalData as Policy).sourceUrl && (
                    <a
                      href={(selectedNode.data.originalData as Policy).sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Source
                    </a>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {selectedNode?.data.type === 'agency' && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10 dark:bg-amber-400/15">
                    <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Agency Details</DialogTitle>
                    <DialogDescription className="text-xs">View agency information</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <h3 className="font-semibold">
                  {(selectedNode.data.originalData as Agency).name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">
                    {(selectedNode.data.originalData as Agency).acronym}
                  </Badge>
                  <Badge variant="outline">
                    {(selectedNode.data.originalData as Agency).level}
                  </Badge>
                  <Badge variant="secondary">
                    {
                      JURISDICTION_NAMES[
                        (selectedNode.data.originalData as Agency).jurisdiction as Jurisdiction
                      ]
                    }
                  </Badge>
                </div>
                {(selectedNode.data.originalData as Agency).aiTransparencyStatement && (
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="text-sm font-medium mb-2">AI Transparency Statement</h4>
                    <p className="text-sm text-muted-foreground">
                      {(selectedNode.data.originalData as Agency).aiTransparencyStatement}
                    </p>
                  </div>
                )}
                {(selectedNode.data.originalData as Agency).aiUsageDisclosure && (
                  <div className="p-4 bg-blue-500/10 dark:bg-blue-400/10 rounded-lg border border-blue-500/20 dark:border-blue-400/20">
                    <h4 className="text-sm font-medium mb-2">AI Usage Disclosure</h4>
                    <p className="text-sm text-muted-foreground">
                      {(selectedNode.data.originalData as Agency).aiUsageDisclosure}
                    </p>
                  </div>
                )}
                <a
                  href={(selectedNode.data.originalData as Agency).website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  Visit Website
                </a>
              </div>
            </>
          )}

          {selectedNode?.data.type === 'jurisdiction' && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-500/10 dark:bg-indigo-400/15">
                    <Map className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Jurisdiction</DialogTitle>
                    <DialogDescription className="text-xs">
                      {
                        JURISDICTION_NAMES[
                          (selectedNode.data.originalData as { jurisdiction: Jurisdiction }).jurisdiction
                        ]
                      }
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20 dark:from-green-400/15 dark:to-green-400/5 dark:border-green-400/20">
                    <CardContent className="pt-4 pb-3">
                      <div className="text-2xl font-bold">
                        {
                          policiesData.filter(
                            (p) =>
                              p.jurisdiction ===
                              (selectedNode.data.originalData as { jurisdiction: Jurisdiction }).jurisdiction
                          ).length
                        }
                      </div>
                      <p className="text-xs text-muted-foreground">Policies</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20 dark:from-amber-400/15 dark:to-amber-400/5 dark:border-amber-400/20">
                    <CardContent className="pt-4 pb-3">
                      <div className="text-2xl font-bold">
                        {
                          agenciesData.filter(
                            (a) =>
                              a.jurisdiction ===
                              (selectedNode.data.originalData as { jurisdiction: Jurisdiction }).jurisdiction
                          ).length
                        }
                      </div>
                      <p className="text-xs text-muted-foreground">Agencies</p>
                    </CardContent>
                  </Card>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setFilterJurisdiction(
                      (selectedNode.data.originalData as { jurisdiction: Jurisdiction }).jurisdiction
                    );
                    setSelectedNode(null);
                  }}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filter by this Jurisdiction
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
