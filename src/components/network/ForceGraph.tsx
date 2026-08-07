"use client";

import {
	useRef,
	useEffect,
	useState,
	useCallback,
	useMemo,
} from "react";
import {
	zoom as d3Zoom,
	zoomIdentity,
	type ZoomBehavior,
} from "d3-zoom";
import { select } from "d3-selection";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { NetworkNode, NetworkEdge } from "@/lib/network-data";
import type {
	NetworkRelationFilter,
	NetworkViewMode,
} from "@/lib/network-view-state";
import { useForceSimulation, type SimNode } from "./use-force-simulation";

interface ForceGraphProps {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
	visibleNodeIds: Set<string>;
	relationFilter: NetworkRelationFilter;
	viewMode: NetworkViewMode;
	selectedNodeId: string | null;
	onNodeClick: (id: string) => void;
	onStepNode: (id: string, direction: 1 | -1) => void;
}

function getEdgeIds(edge: {
	source: string | number | SimNode;
	target: string | number | SimNode;
}): [string, string] {
	const source =
		typeof edge.source === "object" ? edge.source.id : String(edge.source);
	const target =
		typeof edge.target === "object" ? edge.target.id : String(edge.target);
	return [source, target];
}

function getNeighbourIds(
	nodeId: string | null,
	edges: Array<{
		source: string | number | SimNode;
		target: string | number | SimNode;
	}>,
): Set<string> {
	if (!nodeId) return new Set();
	const ids = new Set<string>([nodeId]);
	for (const edge of edges) {
		const [source, target] = getEdgeIds(edge);
		if (source === nodeId) ids.add(target);
		if (target === nodeId) ids.add(source);
	}
	return ids;
}

export function ForceGraph({
	nodes,
	edges,
	visibleNodeIds,
	relationFilter,
	viewMode,
	selectedNodeId,
	onNodeClick,
	onStepNode,
}: ForceGraphProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	const [dimensions, setDimensions] = useState({ width: 800, height: 620 });
	const [hoveredNode, setHoveredNode] = useState<string | null>(null);
	const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

	useEffect(() => {
		if (!containerRef.current) return;
		const observer = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0) setDimensions({ width, height });
		});
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	const filteredEdges = useMemo(
		() =>
			edges.filter(
				(edge) =>
					relationFilter === "all" || edge.kind === relationFilter,
			),
		[edges, relationFilter],
	);

	const { simNodes, simEdges, renderReady } = useForceSimulation(
		nodes,
		filteredEdges,
		dimensions.width,
		dimensions.height,
		selectedNodeId,
		viewMode,
	);

	useEffect(() => {
		if (!svgRef.current) return;
		const svg = select(svgRef.current);
		const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.45, 3.2])
			.filter((event) => {
				if (event.type === "wheel") {
					const wheelEvent = event as WheelEvent;
					return wheelEvent.ctrlKey || wheelEvent.metaKey;
				}
				if (event.type.startsWith("touch")) {
					return (event as TouchEvent).touches.length >= 2;
				}
				return !(event as MouseEvent).button;
			})
			.on("zoom", (event) => {
				setTransform({
					x: event.transform.x,
					y: event.transform.y,
					k: event.transform.k,
				});
			});
		zoomRef.current = zoomBehavior;
		svg.call(zoomBehavior);
		return () => {
			svg.on(".zoom", null);
			zoomRef.current = null;
		};
	}, []);

	const selectedIds = useMemo(
		() => getNeighbourIds(selectedNodeId, simEdges),
		[selectedNodeId, simEdges],
	);
	const previewIds = useMemo(
		() => getNeighbourIds(hoveredNode, simEdges),
		[hoveredNode, simEdges],
	);
	const activeIds = hoveredNode ? previewIds : selectedIds;

	const labelledIds = useMemo(() => {
		if (hoveredNode) return previewIds;
		if (selectedNodeId) {
			if (dimensions.width >= 640) return selectedIds;
			const strongestNeighbours = simEdges
				.flatMap((edge) => {
					const [source, target] = getEdgeIds(edge);
					if (source === selectedNodeId) {
						return [{ id: target, weight: edge.weight, kind: edge.kind }];
					}
					if (target === selectedNodeId) {
						return [{ id: source, weight: edge.weight, kind: edge.kind }];
					}
					return [];
				})
				.sort(
					(a, b) =>
						Number(b.kind === "formal") -
							Number(a.kind === "formal") ||
						b.weight - a.weight ||
						a.id.localeCompare(b.id, "en-AU"),
				)
				.slice(0, 2)
				.map((entry) => entry.id);
			return new Set([selectedNodeId, ...strongestNeighbours]);
		}
		return new Set(
			[...nodes]
				.sort(
					(a, b) =>
						b.thematicDegree - a.thematicDegree ||
						a.title.localeCompare(b.title, "en-AU"),
				)
				.slice(0, 5)
				.map((node) => node.id),
		);
	}, [
		dimensions.width,
		hoveredNode,
		nodes,
		previewIds,
		selectedIds,
		selectedNodeId,
		simEdges,
	]);

	const selectedSimNode = useMemo(
		() => simNodes.find((node) => node.id === selectedNodeId) ?? null,
		[selectedNodeId, simNodes],
	);

	const zoomBy = useCallback((factor: number) => {
		if (!svgRef.current || !zoomRef.current) return;
		select(svgRef.current).call(zoomRef.current.scaleBy, factor);
	}, []);

	const fitSelection = useCallback(() => {
		if (!svgRef.current || !zoomRef.current) return;
		const targetNodes = simNodes.filter((node) =>
			selectedNodeId ? selectedIds.has(node.id) : visibleNodeIds.has(node.id),
		);
		if (targetNodes.length === 0) return;

		const minX = Math.min(...targetNodes.map((node) => node.x));
		const maxX = Math.max(...targetNodes.map((node) => node.x));
		const minY = Math.min(...targetNodes.map((node) => node.y));
		const maxY = Math.max(...targetNodes.map((node) => node.y));
		const selectionWidth = Math.max(120, maxX - minX + 120);
		const selectionHeight = Math.max(120, maxY - minY + 120);
		const scale = Math.max(
			0.6,
			Math.min(
				2.25,
				(dimensions.width * 0.84) / selectionWidth,
				(dimensions.height * 0.78) / selectionHeight,
			),
		);
		const centreX = (minX + maxX) / 2;
		const centreY = (minY + maxY) / 2;
		const nextTransform = zoomIdentity
			.translate(
				dimensions.width / 2 - scale * centreX,
				dimensions.height / 2 - scale * centreY,
			)
			.scale(scale);
		select(svgRef.current).call(zoomRef.current.transform, nextTransform);
	}, [
		dimensions.height,
		dimensions.width,
		selectedIds,
		selectedNodeId,
		simNodes,
		visibleNodeIds,
	]);

	const visibleCount = simNodes.filter((node) =>
		visibleNodeIds.has(node.id),
	).length;

	return (
		<div
			ref={containerRef}
			className="network-graph relative h-full min-h-[34rem] w-full overflow-hidden bg-background"
			data-render-ready={renderReady ? "true" : "false"}
		>
			<div
				className="absolute left-3 top-3 z-10 flex flex-col border border-border bg-background/95"
				data-print-hidden
			>
				<button
					type="button"
					onClick={() => zoomBy(1.3)}
					className="flex size-11 items-center justify-center border-b border-border hover:bg-muted"
					aria-label="Zoom in"
				>
					<Plus className="size-4" />
				</button>
				<button
					type="button"
					onClick={() => zoomBy(1 / 1.3)}
					className="flex size-11 items-center justify-center border-b border-border hover:bg-muted"
					aria-label="Zoom out"
				>
					<Minus className="size-4" />
				</button>
				<button
					type="button"
					onClick={fitSelection}
					className="flex size-11 flex-col items-center justify-center gap-0.5 hover:bg-muted"
					aria-label="Fit selected policies"
				>
					<LocateFixed className="size-4" />
					<span className="text-[8px] leading-none">Fit</span>
				</button>
			</div>

			<svg
				ref={svgRef}
				width={dimensions.width}
				height={dimensions.height}
				className="touch-pan-y cursor-grab active:cursor-grabbing"
				role="group"
				aria-labelledby="network-graph-title network-graph-description"
			>
				<title id="network-graph-title">
					Australian AI policy relationship explorer
				</title>
				<desc id="network-graph-description">
					{visibleCount} policies are visible. The selected policy and its
					direct thematic or formal relationships are emphasized. Thematic
					proximity is inferred and does not imply legal authority,
					dependency or endorsement.
				</desc>
				<defs>
					<pattern
						id="network-dots"
						x="0"
						y="0"
						width="20"
						height="20"
						patternUnits="userSpaceOnUse"
					>
						<circle cx="10" cy="10" r="0.65" className="fill-border" />
					</pattern>
					<marker
						id="network-formal-arrow"
						viewBox="0 0 10 10"
						refX="10"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--caution)" />
					</marker>
				</defs>
				<rect
					width={dimensions.width}
					height={dimensions.height}
					fill="url(#network-dots)"
				/>

				<g
					transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
				>
					{simEdges.map((edge, index) => {
						const source = edge.source as SimNode;
						const target = edge.target as SimNode;
						if (
							!visibleNodeIds.has(source.id) ||
							!visibleNodeIds.has(target.id)
						) {
							return null;
						}

						const [sourceId, targetId] = getEdgeIds(edge);
						const active =
							activeIds.has(sourceId) && activeIds.has(targetId);
						const isFormal = edge.kind === "formal";
						return (
							<line
								key={`${edge.kind}-${sourceId}-${targetId}-${index}`}
								x1={source.x}
								y1={source.y}
								x2={target.x}
								y2={target.y}
								stroke={
									isFormal
										? "var(--caution)"
										: active
											? "var(--trust)"
											: "var(--network-edge)"
								}
								strokeWidth={
									active
										? 2.4
										: isFormal
											? 1.8
											: Math.min(1.7, 0.65 + edge.weight * 0.18)
								}
								strokeDasharray={isFormal ? undefined : "3 3"}
								markerEnd={
									isFormal ? "url(#network-formal-arrow)" : undefined
								}
								opacity={
									activeIds.size > 0 ? (active ? 0.95 : 0.13) : 0.34
								}
								vectorEffect="non-scaling-stroke"
							>
								<title>
									{isFormal
										? "Formal supersession relationship"
										: `${edge.sharedThemes.length} shared editorial ${edge.sharedThemes.length === 1 ? "theme" : "themes"}: ${edge.sharedThemes.join(", ")}`}
								</title>
							</line>
						);
					})}

					{simNodes.map((node) => {
						const visible = visibleNodeIds.has(node.id);
						const selected = selectedNodeId === node.id;
						const hovered = hoveredNode === node.id;
						const connected = activeIds.has(node.id);
						const showLabel = labelledIds.has(node.id) && visible;
						const deltaX = selectedSimNode
							? node.x - selectedSimNode.x
							: node.x - dimensions.width / 2;
						const deltaY = selectedSimNode
							? node.y - selectedSimNode.y
							: 0;
						const verticalLabel =
							!selected && Math.abs(deltaY) > Math.abs(deltaX) * 1.1;
						const labelOnLeft =
							node.x > dimensions.width * 0.68 ||
							(node.x >= dimensions.width * 0.32 && deltaX < 0);
						const labelX = selected
							? 0
							: verticalLabel
								? 0
								: labelOnLeft
									? -(node.radius + 7)
									: node.radius + 7;
						const labelY = selected
							? node.radius + 17
							: verticalLabel
								? deltaY < 0
									? -(node.radius + 8)
									: node.radius + 15
								: 4;
						const fill = selected
							? "var(--primary)"
							: connected
								? "var(--trust)"
								: "var(--network-default-bg)";
						const opacity = !visible
							? 0.06
							: activeIds.size > 0
								? connected
									? 1
									: viewMode === "focus"
										? 0.16
										: 0.34
								: 0.8;

						return (
							<g
								key={node.id}
								transform={`translate(${node.x},${node.y})`}
								opacity={opacity}
								className="cursor-pointer transition-opacity duration-150 outline-none"
								role="button"
								tabIndex={visible ? 0 : -1}
								aria-label={node.title}
								aria-pressed={selected}
								onMouseEnter={() => setHoveredNode(node.id)}
								onMouseLeave={() => setHoveredNode(null)}
								onFocus={() => setHoveredNode(node.id)}
								onBlur={() => setHoveredNode(null)}
								onClick={(event) => {
									event.stopPropagation();
									onNodeClick(node.id);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onNodeClick(node.id);
									}
									if (event.key === "ArrowRight" || event.key === "ArrowDown") {
										event.preventDefault();
										onStepNode(node.id, 1);
									}
									if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
										event.preventDefault();
										onStepNode(node.id, -1);
									}
								}}
							>
								<circle
									r={Math.max(22, node.radius + 10)}
									fill="transparent"
									pointerEvents="all"
								/>
								{selected ? (
									<circle
										r={node.radius + 5}
										fill="none"
										stroke="var(--primary)"
										strokeWidth={2}
										vectorEffect="non-scaling-stroke"
									/>
								) : null}
								<circle
									r={hovered ? node.radius * 1.13 : node.radius}
									fill={fill}
									stroke="var(--background)"
									strokeWidth={2}
									vectorEffect="non-scaling-stroke"
								/>
								{node.formalDegree > 0 ? (
									<circle
										cx={node.radius * 0.72}
										cy={-node.radius * 0.72}
										r={3.2}
										fill="var(--caution)"
										stroke="var(--background)"
										strokeWidth={1}
										vectorEffect="non-scaling-stroke"
									/>
								) : null}
								{showLabel ? (
									<text
										x={labelX}
										y={labelY}
										textAnchor={
											selected || verticalLabel
												? "middle"
												: labelOnLeft
													? "end"
													: "start"
										}
										className={
											selected
												? "fill-primary text-[12px] font-semibold"
												: "fill-foreground text-[11px] font-medium"
										}
										style={{
											paintOrder: "stroke",
											stroke: "var(--background)",
											strokeWidth: 4,
										}}
										pointerEvents="none"
									>
										{node.shortLabel}
									</text>
								) : null}
							</g>
						);
					})}
				</g>
			</svg>

			<div className="absolute bottom-3 right-3 hidden border border-border bg-background/95 px-3 py-2 text-[10px] text-muted-foreground sm:block">
				<div className="page-eyebrow mb-1">Edge key</div>
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<span className="h-px w-5 border-t border-dashed border-[var(--trust)]" />
						<span>Thematic proximity</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="h-px w-5 bg-[var(--caution)]" />
						<span>Formal relationship →</span>
					</div>
					<div>Node size reflects relationship count</div>
				</div>
			</div>
		</div>
	);
}
