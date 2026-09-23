"use client";

import { useSyncExternalStore, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { CourtRequirementsList } from "./court-requirements-list";
import {
	ExternalLink,
	ChevronDown,
	ChevronRight,
	Search,
	SlidersHorizontal,
	X,
} from "lucide-react";
import {
	JURISDICTION_NAMES,
	getPolicyDateTypeName,
	getPrimaryPolicyDate,
	type Policy,
	type Jurisdiction,
	type PublicCourtRequirement,
} from "@/types";
import { formatPolicyDate } from "@/lib/format-policy-date";
import { jurisdictionAccent, jurisdictionRailStyle } from "@/lib/jurisdiction-accent";
import { StatusPill, SourceState } from "@/components/policy-indicators";
import { MetricStrip, PageIntro } from "@/components/layout";
import { NoResultsState } from "@/components/ui/empty-state";

/** Group practice notes by jurisdiction, ordered with federal first. */
const JURISDICTION_ORDER: Jurisdiction[] = [
	"federal",
	"nsw",
	"vic",
	"qld",
	"wa",
	"sa",
	"tas",
	"act",
	"nt",
];

interface CourtNote extends Policy {
	courtName: string;
}

type AudienceFilter = "all" | "judicial" | "self-represented" | "profession";
type SortMode = "jurisdiction" | "newest";


const AUDIENCE_TAGS: Record<Exclude<AudienceFilter, "all">, string[]> = {
	judicial: ["judicial officers", "judicial guidelines", "judiciary"],
	"self-represented": [
		"self-represented litigants",
		"litigants in person",
		"access to justice",
	],
	profession: ["legal profession"],
};

function extractCourtName(policy: Policy): string {
	return policy.agencies[0] || "Unknown Court";
}

function matchesAudience(note: CourtNote, audience: AudienceFilter, requirements: PublicCourtRequirement[] = []): boolean {
	if (audience === "all") return true;
	const tags = note.tags.map((tag) => tag.toLowerCase());
	if (AUDIENCE_TAGS[audience].some((tag) => tags.includes(tag))) return true;
	// Use the published actor field, not incidental mentions in quotations.
	// Mixed audiences remain eligible for each applicable audience.
	const actorPatterns = {
		profession: /\b(?:legal practitioners?|practitioners?|lawyers?|legal representatives?|professional representatives?)\b/i,
		judicial: /\b(?:judicial officers?|judges?|judiciary)\b/i,
		"self-represented": /\b(?:self[- ]represented|unrepresented|litigants in person|non[- ]lawyers)\b/i,
	};
	return requirements.some(({ actor }) => actorPatterns[audience].test(actor.replace(/\bnon[- ]lawyers?\b/gi, audience === "profession" ? "" : "$&")));
}

function instrumentLabel(note: CourtNote): string {
	const tags = note.tags.map((tag) => tag.toLowerCase());
	if (tags.includes("procedural direction")) return "Procedural direction";
	if (tags.includes("practice direction")) return "Practice direction";
	if (
		tags.includes("judicial officers") ||
		tags.includes("judicial guidelines") ||
		tags.includes("judiciary")
	) return "Judicial guidance";
	if (tags.includes("guidance note")) return "Guidance note";
	if (tags.includes("guidelines")) return "Guidelines";
	return "Practice note";
}

function newestFirst(a: CourtNote, b: CourtNote): number {
	return (
		new Date(getPrimaryPolicyDate(b).date).getTime() -
		new Date(getPrimaryPolicyDate(a).date).getTime()
	);
}

function subscribeToCourtUrl(onChange: () => void) {
	window.addEventListener("popstate", onChange);
	window.addEventListener("courts-state", onChange);
	return () => {
		window.removeEventListener("popstate", onChange);
		window.removeEventListener("courts-state", onChange);
	};
}
const courtUrlSnapshot = () => window.location.search;
const serverCourtUrlSnapshot = () => "";

function updateCourtUrl(values: Record<string, string | null>) {
	const url = new URL(window.location.href);
	for (const [key, value] of Object.entries(values)) {
		const isDefault = ((key === "jurisdiction" || key === "audience") && value === "all") || (key === "sort" && value === "jurisdiction");
		if (value && !isDefault) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
	}
	// Replace this research state without a history entry per keystroke.
	// Preserve Next's history metadata so Back retains its scroll restoration.
	window.history.replaceState(window.history.state, "", url);
	window.dispatchEvent(new Event("courts-state"));
}

export function CourtsBrowser({
	policies,
	requirements = [],
}: {
	policies: Policy[];
	requirements?: PublicCourtRequirement[];
}) {
	const queryString = useSyncExternalStore(subscribeToCourtUrl, courtUrlSnapshot, serverCourtUrlSnapshot);
	const restoredScroll = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (restoredScroll.current || queryString !== window.location.search) return;
		const top = window.history.state?.courtsScroll;
		if (typeof top !== "number" || !Number.isFinite(top)) {
			restoredScroll.current = true;
			return;
		}
		const container = containerRef.current;
		if (!container) return;
		// App Router can mount this tree while its Activity is still hidden.
		// Wait for a real layout, rather than scrolling a viewport-height page.
		const restore = () => {
			if (!container.getClientRects().length || restoredScroll.current || document.documentElement.scrollHeight < window.innerHeight + top) return;
			window.scrollTo({ top, behavior: "instant" });
			restoredScroll.current = true;
			observer.disconnect();
		};
		const observer = new ResizeObserver(restore);
		observer.observe(container);
		observer.observe(document.body);
		const frame = requestAnimationFrame(restore);
		return () => { cancelAnimationFrame(frame); observer.disconnect(); };
	}, [queryString]);
	const params = new URLSearchParams(queryString);
	const expandedId = params.get("expanded");
	const search = params.get("q") ?? "";
	const jurisdictionParam = params.get("jurisdiction") as Jurisdiction;
	const jurisdiction = JURISDICTION_ORDER.includes(jurisdictionParam) ? jurisdictionParam : "all";
	const audienceParam = params.get("audience") as AudienceFilter;
	const audience = ["judicial", "self-represented", "profession"].includes(audienceParam) ? audienceParam : "all";
	const sortMode: SortMode = params.get("sort") === "newest" ? "newest" : "jurisdiction";

	const practiceNotes: CourtNote[] = useMemo(() => {
		return policies
			.filter((p) => p.type === "practice_note" && p.status !== "trashed")
			.map((p) => ({ ...p, courtName: extractCourtName(p) }));
	}, [policies]);
	const requirementsByPolicy = useMemo(() => {
		const groupedRequirements = new Map<string, PublicCourtRequirement[]>();
		for (const requirement of requirements) {
			const existing = groupedRequirements.get(requirement.policyId) ?? [];
			existing.push(requirement);
			groupedRequirements.set(requirement.policyId, existing);
		}
		return groupedRequirements;
	}, [requirements]);

	const filteredNotes = useMemo(() => {
		const query = search.trim().toLowerCase();
		return practiceNotes.filter((note) => {
			if (jurisdiction !== "all" && note.jurisdiction !== jurisdiction) return false;
			if (!matchesAudience(note, audience, requirementsByPolicy.get(note.id))) return false;
			if (!query) return true;
			return [
				note.title,
				note.courtName,
				JURISDICTION_NAMES[note.jurisdiction],
				note.description,
				note.aiSummary,
				...note.tags,
				...(requirementsByPolicy.get(note.id) ?? []).flatMap((requirement) => [
					requirement.actor, requirement.action, requirement.source.quote, requirement.source.locator,
					...requirement.conditions, ...requirement.exceptions, ...requirement.topics,
				]),
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(query);
		});
	}, [audience, jurisdiction, practiceNotes, search, requirementsByPolicy]);

	const grouped = useMemo(() => {
		const map = new Map<Jurisdiction, CourtNote[]>();
		for (const note of filteredNotes) {
			const list = map.get(note.jurisdiction) || [];
			list.push(note);
			map.set(note.jurisdiction, list);
		}
		for (const list of map.values()) {
			list.sort(newestFirst);
		}
		return map;
	}, [filteredNotes]);

	const jurisdictionsWithNotes = JURISDICTION_ORDER.filter((j) =>
		grouped.has(j),
	);
	const allJurisdictionsWithNotes = JURISDICTION_ORDER.filter((jurisdiction) =>
		practiceNotes.some((note) => note.jurisdiction === jurisdiction),
	);
	const jurisdictionsWithout = JURISDICTION_ORDER.filter(
		(jurisdiction) => !allJurisdictionsWithNotes.includes(jurisdiction),
	);
	const coverageGap = jurisdiction !== "all" && jurisdictionsWithout.includes(jurisdiction);
	const hasActiveFilters = search.trim() !== "" || jurisdiction !== "all" || audience !== "all";
	const judicialGuidanceCount = practiceNotes.filter((note) =>
		matchesAudience(note, "judicial", requirementsByPolicy.get(note.id)),
	).length;
	const sections = sortMode === "newest"
		? [{ id: "newest", title: "Newest guidance", notes: [...filteredNotes].sort(newestFirst) }]
		: jurisdictionsWithNotes.map((item) => ({
				id: item,
				title: JURISDICTION_NAMES[item],
				notes: grouped.get(item)!,
			}));

	function clearFilters() {
		updateCourtUrl({ q: null, jurisdiction: null, audience: null, expanded: null });
	}

	return (
		<div ref={containerRef} className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
			<PageIntro
				title="Courts and tribunals"
				description="Verified practice notes, directions and guidance on AI use in Australian courts and tribunals."
			/>
			<MetricStrip metrics={[
				{ value: practiceNotes.length, label: "instruments" },
				{ value: allJurisdictionsWithNotes.length, label: "jurisdictions" },
				{ value: judicialGuidanceCount, label: "for judicial officers" },
				{ value: requirements.length, label: "verified requirements" },
			]} />

			<div className="pt-7">
				<section aria-label="Find court guidance" className="border-y border-border bg-muted/30 px-3 py-3 sm:px-4">
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_13rem_13rem_11rem]">
						<label className="relative">
							<span className="sr-only">Search court guidance</span>
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="search"
								value={search}
								onChange={(event) => updateCourtUrl({ q: event.target.value })}
								placeholder="Search court, instrument or topic"
								className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
							/>
						</label>
						<label className="relative">
							<span className="sr-only">Filter by jurisdiction</span>
							<SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<select
								value={jurisdiction}
								onChange={(event) => updateCourtUrl({ jurisdiction: event.target.value })}
								className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-10 pr-3 text-sm"
							>
								<option value="all">All jurisdictions</option>
								{JURISDICTION_ORDER.map((item) => (
									<option key={item} value={item}>{JURISDICTION_NAMES[item]}</option>
								))}
							</select>
						</label>
						<label>
							<span className="sr-only">Filter by audience</span>
							<select
								value={audience}
								onChange={(event) => updateCourtUrl({ audience: event.target.value })}
								className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 text-sm"
							>
								<option value="all">All audiences</option>
								<option value="judicial">Judicial officers</option>
								<option value="self-represented">Self-represented people</option>
								<option value="profession">Legal professionals</option>
							</select>
						</label>
						<label>
							<span className="sr-only">Sort guidance</span>
							<select
								value={sortMode}
								onChange={(event) => updateCourtUrl({ sort: event.target.value })}
								className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 text-sm"
							>
								<option value="jurisdiction">By jurisdiction</option>
								<option value="newest">Newest first</option>
							</select>
						</label>
					</div>
					<div className="mt-2 flex min-h-8 items-center justify-between gap-3 text-xs text-muted-foreground" aria-live="polite">
						<span>{filteredNotes.length} of {practiceNotes.length} instruments</span>
						{hasActiveFilters ? (
							<button type="button" onClick={clearFilters} className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline">
								<X className="h-3.5 w-3.5" /> Clear filters
							</button>
						) : null}
					</div>
				</section>

			{filteredNotes.length === 0 && !coverageGap ? (
				<NoResultsState query={search.trim() || undefined} className="border-b border-border" />
			) : sections.map((section) => {
				const sectionJurisdiction = section.id === "newest" ? null : section.id as Jurisdiction;
				return (
					<section key={section.id} className="mt-8">
						<h2 className="page-eyebrow mb-3 flex items-center gap-2">
							<span
								aria-hidden="true"
								className="h-1.5 w-1.5 shrink-0 rounded-full"
								style={{ background: sectionJurisdiction ? jurisdictionAccent(sectionJurisdiction) : "var(--primary)" }}
							/>
							{section.title}
							<span className="text-muted-foreground">({section.notes.length})</span>
						</h2>

						<div className="border-t-2 border-[var(--rule-heavy)]">
							{section.notes.map((note) => {
								const isExpanded = expandedId === note.id;
								const primaryDate = getPrimaryPolicyDate(note);
								const noteRequirements = requirementsByPolicy.get(note.id) ?? [];
								return (
									<div
										key={note.id}
										style={jurisdictionRailStyle(note.jurisdiction)}
										className="ink-rail content-auto border-b border-border pl-3 transition-colors hover:bg-[var(--row-hover)]"
									>
										<button
											type="button"
											id={`court-toggle-${note.id}`}
											aria-expanded={isExpanded}
											aria-controls={`court-panel-${note.id}`}
											onClick={() => updateCourtUrl({ expanded: isExpanded ? null : note.id })}
											className="w-full text-left py-3 pl-2 pr-1 flex items-start gap-3"
										>
											{isExpanded ? (
												<ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
											) : (
												<ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
											)}
											<div className="flex-1 min-w-0">
												<div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
													<div className="min-w-0">
														<div className="text-sm font-semibold text-foreground">
															{note.title}
														</div>
														<div className="text-xs text-muted-foreground mt-0.5">
															{note.courtName} · {instrumentLabel(note)}
														</div>
													</div>
													<div className="mt-2 flex items-center gap-3 sm:mt-0 sm:shrink-0 sm:gap-4">
														<StatusPill status={note.status} dates={note.dates} />
														<span className="font-mono text-[11px] text-muted-foreground sm:text-xs">
															{getPolicyDateTypeName(primaryDate.type)}{" "}
															{formatPolicyDate(primaryDate)}
														</span>
													</div>
												</div>
											</div>
										</button>

										<div id={`court-panel-${note.id}`} role="region" aria-labelledby={`court-toggle-${note.id}`} hidden={!isExpanded}>
										{isExpanded && (
											<div className="pl-8 pr-4 pb-4 space-y-3">
												{(note.aiSummary || note.description) && (
													<div>
														<span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
															Overview
														</span>
														<p className="text-sm text-muted-foreground mt-1">
															{note.aiSummary || note.description}
														</p>
													</div>
												)}

												<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-2">
													<SourceState verification={note.verification} />
													{note.sourceUrl && (
														<a
															href={note.sourceUrl}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
														>
															Source document
															<ExternalLink className="h-3 w-3" />
														</a>
													)}
													<Link
														href={`/policies/${note.id}`}
														onClick={() => window.history.replaceState({ ...window.history.state, courtsScroll: window.scrollY }, "")}
														className="text-xs font-medium text-primary hover:underline"
													>
														View full record
													</Link>
												</div>

												{note.verification.checkedAt && (
													<p className="text-xs leading-5 text-muted-foreground">Record source checked: {new Date(note.verification.checkedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" })}. Collection freshness is not a new editorial review of this record. Always check the official source.</p>
												)}
												<CourtRequirementsList title={note.title} requirements={noteRequirements} />

												{/* Key requirements */}
												{note.content && (
													<div>
														<span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
															Key details
														</span>
														<p className="text-sm text-muted-foreground mt-1">
															{note.content}
														</p>
													</div>
												)}

												{/* Tags */}
												{note.tags.length > 0 && (
													<div className="flex flex-wrap gap-1.5">
														{note.tags
															.filter((t) => t !== "courts" && t !== "judicial")
															.map((tag) => (
																<span
																	key={tag}
																	className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 bg-muted rounded text-muted-foreground"
																>
																	{tag}
																</span>
															))}
													</div>
												)}

											</div>
										)}
										</div>
									</div>
								);
							})}
						</div>
					</section>
				);
			})}

			{((sortMode === "jurisdiction" && !hasActiveFilters && jurisdictionsWithout.length > 0) || coverageGap) && (
			<section className="mt-10">
						<h2 className="page-eyebrow mb-3">
							No currently verified instruments
					</h2>
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
						{(coverageGap ? [jurisdiction as Jurisdiction] : jurisdictionsWithout).map((j) => (
							<div
								key={j}
								className="px-3 py-2 border border-dashed border-border rounded text-sm text-muted-foreground"
							>
								{JURISDICTION_NAMES[j]}
							</div>
						))}
					</div>
					<p className="text-xs text-muted-foreground mt-3">
						Policai does not currently have a verified public AI practice note
						for these jurisdictions. Records awaiting re-verification are
						withheld until their official source evidence is current.
					</p>
				</section>
			)}
			</div>
		</div>
	);
}
