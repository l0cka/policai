'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { zoom as d3Zoom, type ZoomBehavior } from 'd3-zoom';
import { select } from 'd3-selection';
import { drag as d3Drag } from 'd3-drag';
import type { NetworkNode, NetworkEdge } from '@/app/api/network/route';
import { useForceSimulation, type SimNode } from './use-force-simulation';
import { JURISDICTION_COLORS, resolveColor } from './jurisdiction-colors';
import { JURISDICTION_NAMES, type Jurisdiction } from '@/types';

interface ForceGraphProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  searchQuery: string;
  activeJurisdictions: Set<string>;
  selectedNodeId: string | null;
  onNodeClick: (id: string) => void;
}

const STATUS_RING_COLORS: Record<string, string> = {
  active: 'var(--status-active)',
  proposed: 'var(--status-proposed)',
  amended: 'var(--status-amended)',
  repealed: 'var(--status-repealed)',
};

export function ForceGraph({
  nodes,
  edges,
  searchQuery,
  activeJurisdictions,
  selectedNodeId,
  onNodeClick,
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { simNodes, simEdges, simulation } = useForceSimulation(
    nodes,
    edges,
    dimensions.width,
    dimensions.height,
  );

  // Compute cluster centroids for labels
  const clusterLabels = useMemo(() => {
    const groups: Record<string, { xs: number[]; ys: number[] }> = {};
    for (const node of simNodes) {
      if (!groups[node.jurisdiction]) groups[node.jurisdiction] = { xs: [], ys: [] };
      groups[node.jurisdiction].xs.push(node.x);
      groups[node.jurisdiction].ys.push(node.y);
    }
    return Object.entries(groups).map(([jurisdiction, { xs, ys }]) => ({
      jurisdiction,
      label: JURISDICTION_NAMES[jurisdiction as Jurisdiction] || jurisdiction,
      x: xs.reduce((a, b) => a + b, 0) / xs.length,
      y: ys.reduce((a, b) => a + b, 0) / ys.length - 30,
    }));
  }, [simNodes]);

  // Zoom behavior
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });
    svg.call(zoomBehavior);
    return () => { svg.on('.zoom', null); };
  }, []);

  // Drag behavior
  const handleDragStart = useCallback(
    (nodeId: string) => {
      const sim = simulation.current;
      if (sim) sim.alphaTarget(0.3).restart();
      const node = sim?.nodes().find((n) => (n as SimNode).id === nodeId) as SimNode | undefined;
      if (node) node.fx = node.x;
      if (node) node.fy = node.y;
    },
    [simulation],
  );

  const handleDrag = useCallback(
    (nodeId: string, dx: number, dy: number) => {
      const sim = simulation.current;
      const node = sim?.nodes().find((n) => (n as SimNode).id === nodeId) as SimNode | undefined;
      if (node) {
        node.fx = (node.fx ?? node.x) + dx / transform.k;
        node.fy = (node.fy ?? node.y) + dy / transform.k;
      }
    },
    [simulation, transform.k],
  );

  const handleDragEnd = useCallback(
    (nodeId: string) => {
      const sim = simulation.current;
      if (sim) sim.alphaTarget(0);
      const node = sim?.nodes().find((n) => (n as SimNode).id === nodeId) as SimNode | undefined;
      if (node) { node.fx = null; node.fy = null; }
    },
    [simulation],
  );

  // Node visibility
  const isNodeVisible = useCallback(
    (node: SimNode) => {
      if (!activeJurisdictions.has(node.jurisdiction)) return false;
      if (searchQuery && !node.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    },
    [activeJurisdictions, searchQuery],
  );

  // Connected node highlighting
  const connectedIds = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const ids = new Set<string>();
    ids.add(hoveredNode);
    for (const edge of simEdges) {
      const src = typeof edge.source === 'object' ? (edge.source as SimNode).id : String(edge.source);
      const tgt = typeof edge.target === 'object' ? (edge.target as SimNode).id : String(edge.target);
      if (src === hoveredNode) ids.add(tgt);
      if (tgt === hoveredNode) ids.add(src);
    }
    return ids;
  }, [hoveredNode, simEdges]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="cursor-grab active:cursor-grabbing"
      >
        {/* Background pattern */}
        <defs>
          <pattern id="network-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.8" className="fill-border" />
          </pattern>
        </defs>
        <rect width={dimensions.width} height={dimensions.height} fill="url(#network-dots)" />

        <g ref={gRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Edges */}
          {simEdges.map((edge, i) => {
            const src = edge.source as SimNode;
            const tgt = edge.target as SimNode;
            if (!isNodeVisible(src) || !isNodeVisible(tgt)) return null;

            const isHighlighted = hoveredNode && (connectedIds.has(src.id) && connectedIds.has(tgt.id));
            const jurisdictionColor = resolveColor(JURISDICTION_COLORS[src.jurisdiction] || 'var(--chart-1)');

            return (
              <line
                key={`edge-${i}`}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={edge.crossJurisdiction ? '#a855f7' : jurisdictionColor}
                strokeWidth={isHighlighted ? 2.5 : 1}
                strokeDasharray={edge.crossJurisdiction ? '6,3' : undefined}
                opacity={hoveredNode ? (isHighlighted ? 0.8 : 0.15) : 0.3}
                className="transition-opacity duration-200"
              />
            );
          })}

          {/* Cluster labels */}
          {clusterLabels
            .filter((cl) => activeJurisdictions.has(cl.jurisdiction))
            .map((cl) => (
              <text
                key={`label-${cl.jurisdiction}`}
                x={cl.x}
                y={cl.y}
                textAnchor="middle"
                className="fill-muted-foreground font-sans text-[11px] font-medium pointer-events-none select-none"
                opacity={0.5}
              >
                {cl.label}
              </text>
            ))}

          {/* Nodes */}
          {simNodes.map((node) => {
            const visible = isNodeVisible(node);
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNodeId === node.id;
            const isConnected = connectedIds.has(node.id);
            const jurisdictionColor = resolveColor(JURISDICTION_COLORS[node.jurisdiction] || 'var(--chart-1)');
            const statusColor = resolveColor(STATUS_RING_COLORS[node.status] || 'var(--status-repealed)');

            const nodeOpacity = !visible
              ? 0.08
              : hoveredNode
                ? isConnected
                  ? 1
                  : 0.25
                : 1;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                opacity={nodeOpacity}
                className="transition-opacity duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onNodeClick(node.id)}
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startY = e.clientY;
                  let dragged = false;
                  handleDragStart(node.id);

                  const onMove = (ev: MouseEvent) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
                    handleDrag(node.id, ev.movementX, ev.movementY);
                  };
                  const onUp = () => {
                    handleDragEnd(node.id);
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    if (!dragged) onNodeClick(node.id);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                  e.stopPropagation();
                }}
              >
                {/* Status ring */}
                <circle
                  r={node.radius + 2}
                  fill="none"
                  stroke={statusColor}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  opacity={isHovered || isSelected ? 1 : 0.6}
                />
                {/* Node circle */}
                <circle
                  r={isHovered ? node.radius * 1.2 : node.radius}
                  fill={jurisdictionColor}
                  className="transition-all duration-150"
                />
                {/* Hover label */}
                {isHovered && (
                  <>
                    <rect
                      x={-node.title.length * 3.2}
                      y={-node.radius - 26}
                      width={node.title.length * 6.4}
                      height={18}
                      rx={4}
                      className="fill-card stroke-border"
                      strokeWidth={0.5}
                    />
                    <text
                      y={-node.radius - 14}
                      textAnchor="middle"
                      className="fill-foreground font-sans text-[10px] pointer-events-none select-none"
                    >
                      {node.title.length > 40 ? node.title.slice(0, 37) + '...' : node.title}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
