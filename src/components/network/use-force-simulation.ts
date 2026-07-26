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
import { randomLcg } from 'd3-random';
import type {
  FormalRelationship,
  NetworkEdge,
  NetworkEdgeKind,
  NetworkNode,
} from '@/lib/network-data';
import type { NetworkViewMode } from '@/lib/network-view-state';

export interface SimNode extends SimulationNodeDatum, NetworkNode {
  x: number;
  y: number;
  radius: number;
}

export interface SimEdge extends SimulationLinkDatum<SimNode> {
  kind: NetworkEdgeKind;
  weight: number;
  sharedThemes: string[];
  crossJurisdiction: boolean;
  formalRelationship?: FormalRelationship;
}

interface Point {
  x: number;
  y: number;
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function getJurisdictionCentroids(
  jurisdictions: string[],
  width: number,
  height: number,
): Record<string, Point> {
  const centroids: Record<string, Point> = {};
  const count = Math.max(1, jurisdictions.length);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(
    72,
    Math.min(width, height) * (width < 640 ? 0.3 : 0.34),
  );

  jurisdictions.forEach((jurisdiction, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    centroids[jurisdiction] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return centroids;
}

function buildFocusTargets(
  selectedNodeId: string | null,
  edges: NetworkEdge[],
  width: number,
  height: number,
): Map<string, Point> {
  const targets = new Map<string, Point>();
  if (!selectedNodeId) return targets;

  const neighbourIds = [
    ...new Set(
      edges.flatMap((edge) => {
        if (edge.source === selectedNodeId) return [edge.target];
        if (edge.target === selectedNodeId) return [edge.source];
        return [];
      }),
    ),
  ].sort();

  const centre = {
    x: width < 640 ? width / 2 : width * 0.46,
    y: height * (width < 640 ? 0.31 : 0.5),
  };
  const radius = Math.max(
    88,
    Math.min(width, height) * (width < 640 ? 0.28 : 0.26),
  );

  targets.set(selectedNodeId, centre);
  neighbourIds.forEach((nodeId, index) => {
    const angle =
      (2 * Math.PI * index) / Math.max(1, neighbourIds.length) -
      Math.PI / 2;
    targets.set(nodeId, {
      x: centre.x + radius * Math.cos(angle),
      y: centre.y + radius * Math.sin(angle),
    });
  });

  return targets;
}

export function useForceSimulation(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  width: number,
  height: number,
  selectedNodeId: string | null,
  viewMode: NetworkViewMode,
) {
  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);
  const [readySignature, setReadySignature] = useState('');
  const tickRef = useRef(0);
  const layoutSignature = [
    width,
    height,
    selectedNodeId ?? 'none',
    viewMode,
    nodes.map((node) => node.id).join(','),
    edges
      .map((edge) => `${edge.kind}:${edge.source}:${edge.target}`)
      .join(','),
  ].join('|');

  const updatePositions = useCallback(() => {
    if (!simRef.current) return;
    const currentNodes = simRef.current.nodes() as SimNode[];
    const linkForce = simRef.current.force('link') as ReturnType<
      typeof forceLink<SimNode, SimEdge>
    >;
    tickRef.current += 1;
    if (tickRef.current % 3 === 0 || tickRef.current < 10) {
      setSimNodes([...currentNodes]);
      setSimEdges([...linkForce.links()]);
    }
  }, []);

  useEffect(() => {
    if (nodes.length === 0 || width === 0 || height === 0) return;

    const jurisdictions = [...new Set(nodes.map((node) => node.jurisdiction))];
    const centroids = getJurisdictionCentroids(
      jurisdictions,
      width,
      height,
    );
    const focusTargets =
      viewMode === 'focus'
        ? buildFocusTargets(selectedNodeId, edges, width, height)
        : new Map<string, Point>();

    const simNodeData: SimNode[] = nodes.map((node) => {
      const target =
        focusTargets.get(node.id) ??
        centroids[node.jurisdiction] ?? {
          x: width / 2,
          y: height / 2,
        };
      const relationshipCount = node.thematicDegree + node.formalDegree;
      return {
        ...node,
        x: target.x + (hashUnit(`${node.id}:x`) - 0.5) * 44,
        y: target.y + (hashUnit(`${node.id}:y`) - 0.5) * 44,
        radius: Math.max(
          6,
          Math.min(11, 6 + Math.sqrt(relationshipCount) * 1.6),
        ),
      };
    });

    const nodeMap = new Map(simNodeData.map((node) => [node.id, node]));
    const simEdgeData: SimEdge[] = edges
      .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
      .map((edge) => ({
        source: nodeMap.get(edge.source)!,
        target: nodeMap.get(edge.target)!,
        kind: edge.kind,
        weight: edge.weight,
        sharedThemes: edge.sharedThemes,
        crossJurisdiction: edge.crossJurisdiction,
        formalRelationship: edge.formalRelationship,
      }));

    simRef.current?.stop();
    tickRef.current = 0;

    const simulation = forceSimulation<SimNode>(simNodeData)
      .randomSource(randomLcg(0.426))
      .force(
        'link',
        forceLink<SimNode, SimEdge>(simEdgeData)
          .id((node) => node.id)
          .distance((edge) => (edge.kind === 'formal' ? 88 : 68))
          .strength((edge) =>
            edge.kind === 'formal' ? 0.24 : Math.min(0.3, 0.06 * edge.weight),
          ),
      )
      .force(
        'charge',
        forceManyBody<SimNode>().strength((node) =>
          focusTargets.has(node.id) ? -180 : -105,
        ),
      )
      .force(
        'collide',
        forceCollide<SimNode>().radius((node) => node.radius + 9),
      )
      .force(
        'x',
        forceX<SimNode>()
          .x(
            (node) =>
              focusTargets.get(node.id)?.x ??
              centroids[node.jurisdiction]?.x ??
              width / 2,
          )
          .strength((node) =>
            node.id === selectedNodeId
              ? 0.85
              : focusTargets.has(node.id)
                ? 0.42
                : 0.1,
          ),
      )
      .force(
        'y',
        forceY<SimNode>()
          .y(
            (node) =>
              focusTargets.get(node.id)?.y ??
              centroids[node.jurisdiction]?.y ??
              height / 2,
          )
          .strength((node) =>
            node.id === selectedNodeId
              ? 0.85
              : focusTargets.has(node.id)
                ? 0.42
                : 0.1,
          ),
      )
      .alphaDecay(0.035);

    simRef.current = simulation;

    const publishFinalState = () => {
      setSimNodes([...(simulation.nodes() as SimNode[])]);
      const linkForce = simulation.force('link') as ReturnType<
        typeof forceLink<SimNode, SimEdge>
      >;
      setSimEdges([...linkForce.links()]);
      setReadySignature(layoutSignature);
    };

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      simulation.stop();
      for (let index = 0; index < 220; index++) simulation.tick();
      publishFinalState();
    } else {
      simulation.on('tick', updatePositions).on('end', publishFinalState);
    }

    return () => {
      simulation.stop();
    };
  }, [
    edges,
    height,
    layoutSignature,
    nodes,
    selectedNodeId,
    updatePositions,
    viewMode,
    width,
  ]);

  return {
    simNodes,
    simEdges,
    simulation: simRef,
    renderReady: readySignature === layoutSignature,
  };
}
