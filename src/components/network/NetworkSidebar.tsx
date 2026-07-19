"use client";

import { X, ExternalLink, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	getJurisdictionName,
	getPolicyDateTypeName,
	getPolicyStatusName,
	getPolicyTypeName,
} from "@/types";
import type { NetworkNode } from "@/lib/network-data";
import { JURISDICTION_COLORS, resolveColor } from "./jurisdiction-colors";
import { formatPolicyDate } from "@/lib/format-policy-date";

interface ConnectedPolicy {
	id: string;
	title: string;
	jurisdiction: string;
}

interface NetworkSidebarProps {
	policy: NetworkNode | null;
	connectedPolicies: ConnectedPolicy[];
	onClose: () => void;
	onNavigateToNode: (id: string) => void;
}

export function NetworkSidebar({
	policy,
	connectedPolicies,
	onClose,
	onNavigateToNode,
}: NetworkSidebarProps) {
	return (
		<div
			className={`absolute bottom-0 right-0 top-0 z-20 w-full max-w-80 border-l border-border bg-card/95 backdrop-blur-xl transition-transform duration-300 ${
				policy ? "translate-x-0" : "translate-x-full"
			}`}
		>
			{policy && (
				<ScrollArea className="h-full">
					<div className="p-5 space-y-4">
						{/* Header */}
						<div className="flex items-center justify-between">
							<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
								Policy Detail
							</span>
							<button
								onClick={onClose}
								className="text-muted-foreground hover:text-foreground transition-colors"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						{/* Badges */}
						<div className="flex flex-wrap gap-1.5">
							<Badge
								variant="default"
								className="text-[10px]"
								style={{
									backgroundColor: `var(--status-${policy.status}-bg)`,
									color: `var(--status-${policy.status})`,
									border: "none",
								}}
							>
								{getPolicyStatusName(policy.status)}
							</Badge>
							<Badge variant="outline" className="text-[10px]">
								{getPolicyTypeName(policy.type)}
							</Badge>
							<Badge variant="secondary" className="text-[10px]">
								{getJurisdictionName(policy.jurisdiction)}
							</Badge>
						</div>

						{/* Title */}
						<h3 className="text-base font-semibold leading-snug">
							{policy.title}
						</h3>

						{/* Date */}
						{policy.effectiveDate && (
							<p className="text-[11px] text-muted-foreground">
								{getPolicyDateTypeName(policy.dateType)}:{" "}
								{formatPolicyDate(
									{
										type: policy.dateType,
										date: policy.effectiveDate,
										precision: policy.datePrecision,
									},
									{ short: true },
								)}
							</p>
						)}

						<p
							className={
								policy.verificationStatus === "verified"
									? "font-mono text-[11px] text-[var(--status-active)]"
									: "font-mono text-[11px] text-[var(--status-proposed)]"
							}
						>
							{policy.verificationStatus === "verified"
								? "Verified"
								: "Needs review"}
						</p>

						{/* Description */}
						<p className="text-sm text-muted-foreground leading-relaxed">
							{policy.description.length > 250
								? policy.description.slice(0, 247) + "..."
								: policy.description}
						</p>

						{/* Connected policies */}
						{connectedPolicies.length > 0 && (
							<div>
								<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold block mb-2">
									Connected Policies
								</span>
								<div className="space-y-1">
									{connectedPolicies.map((cp) => (
										<button
											key={cp.id}
											onClick={() => onNavigateToNode(cp.id)}
											className="group flex w-full items-center gap-2 border-b border-border px-2.5 py-2 text-left transition-colors hover:bg-muted"
										>
											<div
												className="w-2 h-2 rounded-full flex-shrink-0"
												style={{
													backgroundColor: resolveColor(
														JURISDICTION_COLORS[cp.jurisdiction] ||
															"var(--chart-1)",
													),
												}}
											/>
											<span className="text-xs text-foreground truncate flex-1">
												{cp.title}
											</span>
											<ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
										</button>
									))}
								</div>
							</div>
						)}

						{/* Agencies */}
						{policy.agencies.length > 0 && (
							<div>
								<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold block mb-2">
									Agencies
								</span>
								<div className="space-y-1">
									{policy.agencies.map((agency) => (
										<p key={agency} className="text-xs text-muted-foreground">
											{agency}
										</p>
									))}
								</div>
							</div>
						)}

						{/* Tags */}
						{policy.tags.length > 0 && (
							<div className="flex flex-wrap gap-1">
								{policy.tags.map((tag) => (
									<span
										key={tag}
										className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-[10px]"
									>
										{tag}
									</span>
								))}
							</div>
						)}

						{/* Actions */}
						<div className="flex gap-2 pt-2">
							<a
								href={`/policies/${policy.id}`}
								className="flex flex-1 items-center justify-center gap-1 border border-border bg-muted px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
							>
								View Full Policy
								<ArrowRight className="h-3 w-3" />
							</a>
							{policy.sourceUrl && (
								<a
									href={policy.sourceUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-1 border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
								>
									Source
									<ExternalLink className="h-3 w-3" />
								</a>
							)}
						</div>
					</div>
				</ScrollArea>
			)}
		</div>
	);
}
