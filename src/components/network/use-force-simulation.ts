'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { NetworkNode, NetworkEdge } from '@/app/api/network/route';

export interface SimNode extends SimulationNodeDatum, NetworkNode {
  x: number;
  y: number;
  radius: number;
}

export interface SimEdge extends SimulationLinkDatum<SimNode> {
  weight: number;
  crossJurisdiction: boolean;
}

/** Compute cluster centroids for jurisdiction-based grouping. */
function getJurisdictionCentroids(
  jurisdictions: string[],
  width: number,
  height: number,
): Record<string, { x: number; y: number }> {
  const centroids: Record<string, { x: number; y: number }> = {};
  const count = jurisdictions.length;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.3;

  jurisdictions.forEach((j, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    centroids[j] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return centroids;
}

export function useForceSimulation(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  width: number,
  height: number,
) {
  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);
  const tickRef = useRef(0);

  const updatePositions = useCallback(() => {
    if (!simRef.current) return;
    const currentNodes = simRef.current.nodes() as SimNode[];
    // Only update state every 3 ticks for performance
    tickRef.current++;
    if (tickRef.current % 3 === 0 || tickRef.current < 10) {
      setSimNodes([...currentNodes]);
      setSimEdges([...(simRef.current.force('link') as ReturnType<typeof forceLink<SimNode, SimEdge>>).links()]);
    }
  }, []);

  useEffect(() => {
    if (nodes.length === 0 || width === 0 || height === 0) return;

    // Build jurisdiction centroids
    const jurisdictions = [...new Set(nodes.map((n) => n.jurisdiction))];
    const centroids = getJurisdictionCentroids(jurisdictions, width, height);

    // Create simulation nodes with initial positions near their jurisdiction centroid
    const simNodeData: SimNode[] = nodes.map((n) => {
      const centroid = centroids[n.jurisdiction] || { x: width / 2, y: height / 2 };
      return {
        ...n,
        x: centroid.x + (Math.random() - 0.5) * 80,
        y: centroid.y + (Math.random() - 0.5) * 80,
        radius: Math.max(5, Math.min(12, 4 + n.tags.length)),
      };
    });

    // Create simulation edges (referencing node objects)
    const nodeMap = new Map(simNodeData.map((n) => [n.id, n]));
    const simEdgeData: SimEdge[] = edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
        crossJurisdiction: e.crossJurisdiction,
      }));

    // Stop previous simulation
    if (simRef.current) simRef.current.stop();

    tickRef.current = 0;

    const simulation = forceSimulation<SimNode>(simNodeData)
      .force(
        'link',
        forceLink<SimNode, SimEdge>(simEdgeData)
          .id((d) => d.id)
          .distance(60)
          .strength((d) => 0.1 * d.weight),
      )
      .force('charge', forceManyBody<SimNode>().strength(-120))
      .force('collide', forceCollide<SimNode>().radius((d) => d.radius + 4))
      // Cluster force: attract toward jurisdiction centroid
      .force(
        'x',
        forceX<SimNode>()
          .x((d) => centroids[d.jurisdiction]?.x ?? width / 2)
          .strength(0.15),
      )
      .force(
        'y',
        forceY<SimNode>()
          .y((d) => centroids[d.jurisdiction]?.y ?? height / 2)
          .strength(0.15),
      )
      .on('tick', updatePositions)
      .alphaDecay(0.02);

    simRef.current = simulation;

    // Final positions after simulation settles
    return () => {
      simulation.stop();
    };
  }, [nodes, edges, width, height, updatePositions]);

  return { simNodes, simEdges, simulation: simRef };
}
