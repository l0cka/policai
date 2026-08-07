"use client";

import { useMemo } from "react";
import {
	ArrowLeft,
	ArrowRight,
	ExternalLink,
	X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	getPolicyDateTypeName,
	getPolicyTypeName,
} from "@/types";
import type {
	NetworkConnection,
	NetworkNode,
} from "@/lib/network-data";
import { formatPolicyDate } from "@/lib/format-policy-date";
import { JurisdictionMark, SourceState, StatusPill } from "@/components/policy-table";

interface NetworkSidebarProps {
	policy: NetworkNode | null;
	connections: NetworkConnection[];
	onClose: () => void;
	onNavigateToNode: (id: string) => void;
}

export function NetworkSidebar({
	policy,
	connections,
	onClose,
	onNavigateToNode,
}: NetworkSidebarProps) {
	const sharedThemes = useMemo(
		() =>
			[
				...new Set(
					connections.flatMap((connection) => connection.sharedThemes),
				),
			].slice(0, 4),
		[connections],
	);

	const step = (direction: 1 | -1) => {
		if (connections.length === 0) return;
		const nextIndex = direction === 1 ? 0 : connections.length - 1;
		onNavigateToNode(connections[nextIndex].node.id);
	};

	return (
		<aside
			className={`network-inspector absolute inset-x-0 bottom-0 z-20 flex max-h-[43%] flex-col border-t border-border bg-card/98 shadow-[var(--shadow-lift)] backdrop-blur-xl transition-transform duration-300 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0 lg:shadow-none ${
				policy
					? "translate-y-0 lg:translate-x-0"
					: "translate-y-full lg:translate-x-full lg:translate-y-0"
			}`}
			aria-label="Selected policy relationships"
			aria-live="polite"
		>
			{policy ? (
				<>
					<div className="flex shrink-0 justify-center py-2 lg:hidden">
						<div className="h-1 w-10 rounded-full bg-border" />
					</div>

					<div className="flex items-center justify-between border-b border-border px-4 pb-3 lg:p-5">
						<div>
							<p className="page-eyebrow">Selected policy</p>
							<h2 className="section-title mt-1 max-w-[17rem] leading-tight">
								{policy.title}
							</h2>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label="Close policy relationship details"
						>
							<X className="size-4" />
						</button>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
						<div className="flex flex-wrap items-center gap-3">
							<StatusPill status={policy.status} />
							<SourceState verification={{ status: policy.verificationStatus }} />
						</div>
						<div className="mt-2 flex flex-wrap gap-1.5">
							<Badge variant="outline" className="rounded-none text-[11px]">
								{getPolicyTypeName(policy.type)}
							</Badge>
							<Badge variant="outline" className="rounded-none text-[11px]">
								<JurisdictionMark jurisdiction={policy.jurisdiction} />
							</Badge>
						</div>

						{policy.effectiveDate ? (
							<p className="mt-3 font-mono text-[11px] text-muted-foreground">
								{getPolicyDateTypeName(policy.dateType)}{" "}
								{formatPolicyDate(
									{
										type: policy.dateType,
										date: policy.effectiveDate,
										precision: policy.datePrecision,
									},
									{ short: true },
								)}
							</p>
						) : null}

						<div className="mt-5 border-t border-border pt-4">
							<div className="flex items-center justify-between gap-3">
								<h3 className="section-title">
									Why these policies connect
								</h3>
								{connections.length > 0 ? (
									<div className="flex shrink-0 items-center gap-1">
										<button
											type="button"
											onClick={() => step(-1)}
											className="flex size-10 items-center justify-center border border-border hover:bg-muted"
											aria-label="Previous related policy"
										>
											<ArrowLeft className="size-3.5" />
										</button>
										<span className="min-w-14 text-center font-mono text-[11px] text-muted-foreground">
											{connections.length} related
										</span>
										<button
											type="button"
											onClick={() => step(1)}
											className="flex size-10 items-center justify-center border border-border hover:bg-muted"
											aria-label="Next related policy"
										>
											<ArrowRight className="size-3.5" />
										</button>
									</div>
								) : null}
							</div>

							{sharedThemes.length > 0 ? (
								<div className="mt-3 flex flex-wrap gap-1.5">
									{sharedThemes.map((theme) => (
										<span
											key={theme}
											className="border border-primary/30 bg-accent px-2 py-1 text-[11px] text-primary"
										>
											{theme}
										</span>
									))}
								</div>
							) : null}
						</div>

						{connections.length > 0 ? (
							<ol className="mt-4 divide-y divide-border">
								{connections.map((connection, index) => (
									<li key={connection.node.id}>
										<button
											type="button"
											onClick={() => onNavigateToNode(connection.node.id)}
											className="group flex min-h-16 w-full gap-3 py-3 text-left hover:bg-muted/45"
										>
											<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] text-primary-foreground">
												{index + 1}
											</span>
											<span className="min-w-0 flex-1">
												<span className="flex items-start justify-between gap-2">
													<span className="text-sm font-medium leading-snug">
														{connection.node.shortLabel}
													</span>
													<span className="shrink-0 border border-border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase text-muted-foreground">
														{connection.node.jurisdiction}
													</span>
												</span>
												<span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
													{connection.formalLabel
														? connection.formalLabel
														: `Shares ${connection.sharedThemes.length} editorial ${connection.sharedThemes.length === 1 ? "theme" : "themes"}`}
													{connection.sharedThemes.length > 0
														? `: ${connection.sharedThemes.slice(0, 3).join(", ")}`
														: ""}
												</span>
											</span>
										</button>
									</li>
								))}
							</ol>
						) : (
							<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
								This policy has no relationships under the current view.
								Try showing all relationship types or clearing filters.
							</p>
						)}

						<div className="mt-5 border-t border-border pt-4">
							<p className="text-sm leading-relaxed text-muted-foreground">
								{policy.description}
							</p>
							{policy.agencies.length > 0 ? (
								<p className="mt-3 text-xs text-muted-foreground">
									<strong className="text-foreground">Published by:</strong>{" "}
									{policy.agencies.join(", ")}
								</p>
							) : null}
						</div>
					</div>

					<div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-background/90 p-3 lg:p-4">
						<a
							href={`/policies/${policy.id}`}
							className="flex min-h-11 items-center justify-center gap-1 border border-primary px-3 text-xs font-medium text-primary hover:bg-accent"
						>
							View full policy
							<ArrowRight className="size-3" />
						</a>
						<a
							href={policy.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex min-h-11 items-center justify-center gap-1 border border-border px-3 text-xs text-muted-foreground hover:bg-muted"
						>
							Official source
							<ExternalLink className="size-3" />
						</a>
					</div>
				</>
			) : null}
		</aside>
	);
}
