"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Copy, Check, FileText } from "lucide-react";
import {
	getJurisdictionName,
	getPolicyDateTypeName,
	getPrimaryPolicyDate,
	getPolicyStatusName,
	getPolicyTypeName,
	type Policy,
} from "@/types";
import { STATUS_COLORS } from "@/lib/design-tokens";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPolicyDate } from "@/lib/format-policy-date";

interface PolicyDetailTabsProps {
	policy: Policy;
	relatedPolicies: Policy[];
}

export function PolicyDetailTabs({
	policy,
	relatedPolicies,
}: PolicyDetailTabsProps) {
	const [activeTab, setActiveTab] = useState<
		"overview" | "content" | "related"
	>("overview");

	const tabs = [
		{ id: "overview" as const, label: "Overview" },
		{ id: "content" as const, label: "Content" },
		{ id: "related" as const, label: "Related" },
	];

	const supersededBy = policy.supersededBy
		? relatedPolicies.find((rp) => rp.id === policy.supersededBy)
		: undefined;
	const primaryDate = getPrimaryPolicyDate(policy);

	return (
		<div>
			{(policy.status === "superseded" || policy.status === "closed") && (
				<div className="mb-4 border-l-2 border-[var(--status-repealed)] bg-[var(--status-repealed-bg)] px-4 py-3 text-sm">
					{policy.status === "superseded" ? (
						<>
							This instrument has been superseded
							{policy.supersededBy && (
								<>
									{" by "}
									<Link
										href={`/policies/${policy.supersededBy}`}
										className="font-medium text-primary hover:underline"
									>
										{supersededBy?.title ?? "its replacement"}
									</Link>
								</>
							)}
							. It is kept for the historical record.
						</>
					) : (
						<>This consultation or proposal is closed and no longer active.</>
					)}
				</div>
			)}

			<h1 className="text-2xl font-bold mb-3">{policy.title}</h1>

			<div className="font-mono text-sm text-muted-foreground mb-6 flex flex-wrap gap-x-2">
				<span>{getJurisdictionName(policy.jurisdiction)}</span>
				<span>&middot;</span>
				<span>{getPolicyTypeName(policy.type)}</span>
				<span>&middot;</span>
				<span className={STATUS_COLORS[policy.status] || ""}>
					{getPolicyStatusName(policy.status)}
				</span>
				<span>&middot;</span>
				<span>
					{getPolicyDateTypeName(primaryDate.type)}{" "}
					{formatPolicyDate(primaryDate)}
				</span>
			</div>

			<div className="border-b border-border mb-6">
				<div className="flex gap-6">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
								activeTab === tab.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
			</div>

			{activeTab === "overview" && (
				<div className="space-y-6 max-w-[720px]">
					<p className="text-sm leading-relaxed">{policy.description}</p>

					{policy.aiSummary && (
						<div className="border-l-2 border-primary/30 pl-4 py-3">
							<div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
								Machine-assisted summary
							</div>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{policy.aiSummary}
							</p>
						</div>
					)}

					{policy.tags && policy.tags.length > 0 && (
						<div>
							<div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
								Tags
							</div>
							<div className="font-mono text-xs text-muted-foreground">
								{policy.tags.join(", ")}
							</div>
						</div>
					)}

					{policy.agencies && policy.agencies.length > 0 && (
						<div>
							<div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
								Agencies
							</div>
							<div className="text-sm">{policy.agencies.join(", ")}</div>
						</div>
					)}

					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
							Key dates
						</div>
						<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
							{policy.dates.map((date) => (
								<div className="contents" key={`${date.type}-${String(date.date)}`}>
									<dt className="text-muted-foreground">
										{getPolicyDateTypeName(date.type)}
									</dt>
									<dd>{formatPolicyDate(date)}</dd>
								</div>
							))}
						</dl>
					</div>

					{policy.sourceUrl && (
						<a
							href={policy.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
						>
							<ExternalLink className="h-3 w-3" />
							View official source
						</a>
					)}

					<div className="border-t border-border pt-4 space-y-1 font-mono text-xs text-muted-foreground">
						<p>
							<span className="text-foreground">Verification:</span>{" "}
							{policy.verification.status === "verified"
								? "Verified against the official source"
								: policy.verification.status === "needs_review"
									? "Needs editorial review"
									: policy.verification.status === "stale"
										? "Verification is stale"
										: "Official source is currently unavailable"}
						</p>
						{policy.verification.checkedAt && (
							<p>
								Checked{" "}
								{new Date(
									policy.verification.checkedAt,
								).toLocaleDateString("en-AU", {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
								{policy.verification.checkedBy
									? ` by ${policy.verification.checkedBy}`
									: ""}
							</p>
						)}
						{policy.verification.source.retrievedAt && (
							<p>
								Source retrieved{" "}
								{new Date(
									policy.verification.source.retrievedAt,
								).toLocaleDateString("en-AU", {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</p>
						)}
						{policy.verification.notes && (
							<p>{policy.verification.notes}</p>
						)}
					</div>
				</div>
			)}

			{activeTab === "content" && (
				<div className="max-w-[720px]">
					{policy.content ? (
						<div className="relative group">
							<CopyButton text={policy.content} />
							<div className="text-sm leading-relaxed whitespace-pre-wrap font-serif">
								{policy.content}
							</div>
						</div>
					) : (
						<EmptyState
							icon={FileText}
							title="No content available"
							description="Detailed policy content has not been added yet."
						/>
					)}
				</div>
			)}

			{activeTab === "related" && (
				<div>
					{relatedPolicies.length === 0 ? (
						<EmptyState
							title="No related policies"
							description="No other policies share the same jurisdiction and tags."
						/>
					) : (
						<div className="border-t border-border">
							{relatedPolicies.map((rp) => (
								<Link
									key={rp.id}
									href={`/policies/${rp.id}`}
									className="flex items-baseline justify-between py-3 border-b border-border hover:bg-muted/50 transition-colors -mx-1 px-1"
								>
									<div>
										<div className="text-sm font-medium text-primary">
											{rp.title}
										</div>
										<div className="font-mono text-xs text-muted-foreground mt-0.5">
											{getJurisdictionName(rp.jurisdiction)}
											{" \u00b7 "}
											{getPolicyTypeName(rp.type)}
										</div>
									</div>
									<span
										className={`font-mono text-xs ${STATUS_COLORS[rp.status] || "text-muted-foreground"}`}
									>
										{getPolicyStatusName(rp.status)}
									</span>
								</Link>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			onClick={() => {
				navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
			className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-foreground"
			aria-label="Copy content"
		>
			{copied ? (
				<Check className="h-4 w-4 text-green-600" />
			) : (
				<Copy className="h-4 w-4" />
			)}
		</button>
	);
}
