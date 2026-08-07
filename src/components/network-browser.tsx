"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import Link from "next/link";
import { CheckCircle2, Network, ShieldCheck } from "lucide-react";
import { ForceGraph } from "@/components/network/ForceGraph";
import { NetworkToolbar } from "@/components/network/NetworkToolbar";
import { NetworkSidebar } from "@/components/network/NetworkSidebar";
import { getJurisdictionName } from "@/types";
import {
	getNetworkConnections,
	nodeMatchesTheme,
	type NetworkEdge,
	type NetworkNode,
	type NetworkSummary,
} from "@/lib/network-data";
import {
	defaultNetworkViewState,
	parseNetworkViewState,
	serializeNetworkViewState,
	type NetworkRelationFilter,
	type NetworkViewMode,
	type NetworkViewState,
} from "@/lib/network-view-state";

interface NetworkBrowserProps {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
	summary: NetworkSummary;
	initialViewState: NetworkViewState;
}

export function NetworkBrowser({
	nodes,
	edges,
	summary,
	initialViewState,
}: NetworkBrowserProps) {
	const [viewState, setViewState] = useState(initialViewState);
	const viewStateRef = useRef(initialViewState);
	const [copied, setCopied] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const parserOptions = useMemo(
		() => ({
			defaultFocus: summary.leadPolicyId,
			validNodeIds: nodes.map((node) => node.id),
			validThemeKeys: summary.themes.map((theme) => theme.key),
		}),
		[nodes, summary.leadPolicyId, summary.themes],
	);

	useEffect(() => {
		const handlePopState = () => {
			const next = parseNetworkViewState(
				new URL(window.location.href).searchParams,
				parserOptions,
			);
			viewStateRef.current = next;
			setViewState(next);
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [parserOptions]);

	useEffect(
		() => () => {
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		},
		[],
	);

	const writeUrl = useCallback(
		(nextState: NetworkViewState, mode: "push" | "replace") => {
			if (typeof window === "undefined") return;
			const params = serializeNetworkViewState(nextState);
			const query = params.toString();
			const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
			window.history[mode === "push" ? "pushState" : "replaceState"](
				{},
				"",
				nextUrl,
			);
		},
		[],
	);

	const updateViewState = useCallback(
		(
			patch:
				| Partial<NetworkViewState>
				| ((current: NetworkViewState) => Partial<NetworkViewState>),
			mode: "push" | "replace" = "replace",
		) => {
			const current = viewStateRef.current;
			const nextPatch =
				typeof patch === "function" ? patch(current) : patch;
			const next = { ...current, ...nextPatch };
			viewStateRef.current = next;
			setViewState(next);
			writeUrl(next, mode);
		},
		[writeUrl],
	);

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
				count,
			}));
	}, [nodes]);

	const activeJurisdictions = useMemo(
		() => new Set<string>(viewState.jurisdictions),
		[viewState.jurisdictions],
	);

	const visibleNodeIds = useMemo(() => {
		const query = viewState.query.trim().toLocaleLowerCase("en-AU");
		return new Set(
			nodes
				.filter((node) => activeJurisdictions.has(node.jurisdiction))
				.filter((node) => nodeMatchesTheme(node, viewState.theme))
				.filter((node) => {
					if (!query) return true;
					return [
						node.title,
						node.description,
						...node.agencies,
						...node.tags,
					].some((value) =>
						value.toLocaleLowerCase("en-AU").includes(query),
					);
				})
				.map((node) => node.id),
		);
	}, [
		activeJurisdictions,
		nodes,
		viewState.query,
		viewState.theme,
	]);

	const effectiveSelectedNodeId = useMemo(() => {
		if (!viewState.focus) return null;
		if (visibleNodeIds.has(viewState.focus)) return viewState.focus;
		return (
			[...nodes]
				.filter((node) => visibleNodeIds.has(node.id))
				.sort(
					(a, b) =>
						b.thematicDegree - a.thematicDegree ||
						a.title.localeCompare(b.title, "en-AU"),
				)[0]?.id ?? null
		);
	}, [nodes, viewState.focus, visibleNodeIds]);

	const relationEdges = useMemo(
		() =>
			edges.filter(
				(edge) =>
					viewState.relation === "all" ||
					edge.kind === viewState.relation,
			),
		[edges, viewState.relation],
	);

	const selectedPolicy = useMemo(
		() =>
			nodes.find((node) => node.id === effectiveSelectedNodeId) ?? null,
		[effectiveSelectedNodeId, nodes],
	);

	const connections = useMemo(() => {
		if (!effectiveSelectedNodeId) return [];
		return getNetworkConnections(
			effectiveSelectedNodeId,
			nodes,
			relationEdges,
		).filter((connection) => visibleNodeIds.has(connection.node.id));
	}, [
		effectiveSelectedNodeId,
		nodes,
		relationEdges,
		visibleNodeIds,
	]);

	const toggleJurisdiction = useCallback(
		(key: string) => {
			updateViewState((current) => {
				const next = new Set(current.jurisdictions);
				const jurisdiction =
					key as NetworkViewState["jurisdictions"][number];
				if (next.has(jurisdiction)) {
					if (next.size === 1) return {};
					next.delete(jurisdiction);
				} else {
					next.add(jurisdiction);
				}
				return {
					jurisdictions: [...next].sort() as NetworkViewState["jurisdictions"],
				};
			});
		},
		[updateViewState],
	);

	const selectNode = useCallback(
		(id: string) => updateViewState({ focus: id, view: "focus" }, "push"),
		[updateViewState],
	);

	const stepNode = useCallback(
		(id: string, direction: 1 | -1) => {
			const related = getNetworkConnections(id, nodes, relationEdges).filter(
				(connection) => visibleNodeIds.has(connection.node.id),
			);
			if (related.length === 0) return;
			const currentIndex = related.findIndex(
				(connection) => connection.node.id === effectiveSelectedNodeId,
			);
			const nextIndex =
				(currentIndex + direction + related.length) % related.length;
			selectNode(related[nextIndex].node.id);
		},
		[
			effectiveSelectedNodeId,
			nodes,
			relationEdges,
			selectNode,
			visibleNodeIds,
		],
	);

	const resetView = useCallback(() => {
		const next = defaultNetworkViewState(summary.leadPolicyId);
		viewStateRef.current = next;
		setViewState(next);
		writeUrl(next, "replace");
	}, [summary.leadPolicyId, writeUrl]);

	const copyLink = useCallback(async () => {
		if (typeof window === "undefined" || !navigator.clipboard) return;
		const copyState = {
			...viewState,
			focus: effectiveSelectedNodeId,
		};
		const params = serializeNetworkViewState(copyState);
		const query = params.toString();
		const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;
		await navigator.clipboard.writeText(url);
		setCopied(true);
		if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
	}, [effectiveSelectedNodeId, viewState]);

	if (nodes.length === 0) {
		return (
			<div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4">
				<Network className="size-12 text-muted-foreground/30" />
				<p className="text-sm text-muted-foreground">No policies found</p>
				<Link href="/" className="text-xs text-primary hover:underline">
					Browse policies →
				</Link>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
			<header className="network-page-intro border-b border-border pb-6">
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
					<div>
						<p className="page-eyebrow">Relationship explorer</p>
						<h1 className="network-desktop-title mt-2 page-title">
							Policy relationships
						</h1>
						<h1 className="network-mobile-title page-title mt-2 hidden">
							Policy relationships
						</h1>
						<p className="network-insight-line mt-3 flex items-start gap-2 text-sm font-medium">
							<span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--trust)]" />
							{summary.insight}
						</p>
						<p className="network-caveat mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
							Thematic proximity is inferred from shared editorial themes.
							It does not imply legal authority, dependency or endorsement.
						</p>
					</div>

					<div className="network-method-intro border-l border-border pl-5 text-xs leading-5 text-muted-foreground">
						<div className="flex items-start gap-3">
							<ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--trust)]" />
							<div>
								<p>
									Formal relationships are shown separately from
									deterministic thematic proximity.
								</p>
								<Link
									href="/methodology"
									className="mt-2 inline-block font-medium text-primary hover:underline"
								>
									How relationships are derived →
								</Link>
							</div>
						</div>
					</div>
				</div>
			</header>

			<dl className="network-metrics grid grid-cols-2 gap-y-4 border-b border-[var(--rule-hair)] py-4 lg:grid-cols-4">
				{[
					{ value: summary.policyCount, label: "policies" },
					{
						value: summary.thematicallyConnectedCount,
						label: "thematically connected",
					},
					{ value: summary.isolatedCount, label: "without thematic links" },
					{
						value: summary.crossJurisdictionLinkCount,
						label: "cross-jurisdiction links",
					},
				].map((metric) => (
					<div
						key={metric.label}
						className="flex items-baseline justify-center gap-2"
					>
						<dd className="font-mono text-xl leading-none tabular">
							{metric.value}
						</dd>
						<dt className="page-eyebrow">{metric.label}</dt>
					</div>
				))}
			</dl>

			<div className="network-workspace relative mt-6 overflow-hidden border border-border bg-background">
				<div className="network-main lg:mr-[22rem]">
					<NetworkToolbar
						searchQuery={viewState.query}
						onSearchChange={(query) => updateViewState({ query })}
						themes={summary.themes}
						selectedTheme={viewState.theme}
						onThemeChange={(theme) => updateViewState({ theme })}
						jurisdictions={jurisdictionInfo}
						activeJurisdictions={activeJurisdictions}
						onToggleJurisdiction={toggleJurisdiction}
						relationFilter={viewState.relation}
						onRelationFilterChange={(relation: NetworkRelationFilter) =>
							updateViewState({ relation })
						}
						viewMode={viewState.view}
						onViewModeChange={(view: NetworkViewMode) =>
							updateViewState({ view }, "push")
						}
						visiblePolicies={visibleNodeIds.size}
						totalPolicies={summary.policyCount}
						onReset={resetView}
						onCopyLink={() => void copyLink()}
						copied={copied}
					/>

					<div className="network-graph-shell relative h-[46rem] sm:h-[43rem] lg:h-[42rem]">
						<ForceGraph
							nodes={nodes}
							edges={edges}
							visibleNodeIds={visibleNodeIds}
							relationFilter={viewState.relation}
							viewMode={viewState.view}
							selectedNodeId={effectiveSelectedNodeId}
							onNodeClick={selectNode}
							onStepNode={stepNode}
						/>
						{visibleNodeIds.size === 0 ? (
							<div className="absolute inset-0 flex items-center justify-center bg-background/75 px-6 text-center">
								<div>
									<p className="section-title">
										No policies match this view
									</p>
									<button
										type="button"
										onClick={resetView}
										className="mt-3 min-h-11 border border-primary px-4 text-sm text-primary hover:bg-accent"
									>
										Reset network filters
									</button>
								</div>
							</div>
						) : null}
					</div>

					<div className="network-method-bar hidden items-start gap-3 border-t border-border px-4 py-3 text-[11px] leading-5 text-muted-foreground lg:flex">
						<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--trust)]" />
						<p>
							<strong className="text-foreground">Method and caveat.</strong>{" "}
							Thematic relationships are inferred from shared editorial
							themes using deterministic rules. Formal supersession is
							directed and shown in amber. Neither treatment implies legal
							authority or endorsement.
						</p>
					</div>
				</div>

				<NetworkSidebar
					policy={selectedPolicy}
					connections={connections}
					onClose={() => updateViewState({ focus: null }, "push")}
					onNavigateToNode={selectNode}
				/>
			</div>

			<details className="mt-4 border border-border bg-card/35">
				<summary className="cursor-pointer px-4 py-3 text-sm font-medium">
					Explore the accessible policy relationship list
				</summary>
				<div className="max-h-[28rem] overflow-y-auto border-t border-border">
					<ul className="divide-y divide-border">
						{nodes
							.filter((node) => visibleNodeIds.has(node.id))
							.sort(
								(a, b) =>
									b.thematicDegree - a.thematicDegree ||
									a.title.localeCompare(b.title, "en-AU"),
							)
							.map((node) => (
								<li key={node.id}>
									<button
										type="button"
										onClick={() => selectNode(node.id)}
										className="grid min-h-14 w-full gap-1 px-4 py-3 text-left hover:bg-muted/45 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
										aria-pressed={effectiveSelectedNodeId === node.id}
									>
										<span className="text-sm font-medium">{node.title}</span>
										<span className="font-mono text-[10px] text-muted-foreground">
											{getJurisdictionName(node.jurisdiction)} ·{" "}
											{node.thematicDegree} thematic · {node.formalDegree} formal
										</span>
									</button>
								</li>
							))}
					</ul>
				</div>
			</details>
		</div>
	);
}
