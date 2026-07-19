"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Network } from "lucide-react";
import { ForceGraph } from "@/components/network/ForceGraph";
import { NetworkToolbar } from "@/components/network/NetworkToolbar";
import { NetworkSidebar } from "@/components/network/NetworkSidebar";
import {
	JURISDICTION_COLORS,
	resolveColor,
} from "@/components/network/jurisdiction-colors";
import { getJurisdictionName } from "@/types";
import type { NetworkNode, NetworkEdge } from "@/lib/network-data";

export function NetworkBrowser({
	nodes,
	edges,
}: {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [activeJurisdictions, setActiveJurisdictions] = useState<Set<string>>(
		new Set(nodes.map((node) => node.jurisdiction)),
	);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
				label: getJurisdictionName(key),
				color: resolveColor(JURISDICTION_COLORS[key] || "var(--chart-1)"),
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
				if (target)
					connected.push({
						id: target.id,
						title: target.title,
						jurisdiction: target.jurisdiction,
					});
			} else if (edge.target === selectedNodeId) {
				const source = nodes.find((n) => n.id === edge.source);
				if (source)
					connected.push({
						id: source.id,
						title: source.title,
						jurisdiction: source.jurisdiction,
					});
			}
		}
		return connected;
	}, [selectedNodeId, edges, nodes]);

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
		<div className="relative h-[calc(100svh-7rem)] min-h-[38rem] w-full overflow-hidden">
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
					No cross-policy connections found yet — policies may not share enough
					tags
				</div>
			)}
		</div>
	);
}
