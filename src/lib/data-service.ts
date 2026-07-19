/**
 * Data Service — file-backed reads and writes over the repo's JSON data.
 *
 * Git is the database: canonical JSON is versioned with the code. Editorial
 * files live under `data/`; public-safe artifacts live under `public/data/`.
 * Local tools publish by committing, while the deployed site only reads them.
 */

import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/file-store";
import {
	canonicalizeRecordVerification,
	canonicalizeSourceEvidence,
	canonicalizeSourceUrl,
	sourceUrlsEqual,
} from "@/lib/source-url";
import {
	policyRevisionHash,
	timelineRevisionHash,
} from "@/lib/policy-revision";
import {
	isVerificationCurrent,
	projectVerificationForPublic,
} from "@/lib/verification";
import { reconcileLinkedDevelopments } from "@/lib/source-review";
import {
	normalizeJurisdiction,
	normalizePolicyType,
	type Agency,
	type CollectionMeta,
	type DatePrecision,
	type Development,
	type McpAuditLog,
	type ManualSourceReview,
	type Policy,
	type PolicyDraft,
	type RecordVerification,
	type SourceReview,
	type SourceReviewStatus,
	type SourceMonitoringState,
	type TimelineEvent,
	type TimelineEventDraft,
	type TimelineEventType,
} from "@/types";

type DataAccess = "public" | "admin";

interface DataServiceOptions {
	access?: DataAccess;
	now?: Date;
}

function canonicalizePolicyRecord<T extends Policy | PolicyDraft>(policy: T): T {
	const sourceUrl = canonicalizeSourceUrl(policy.sourceUrl);
	return {
		...policy,
		sourceUrl,
		...(policy.dates
			? {
					dates: policy.dates.map((date) => ({
						...date,
						...(date.source
							? { source: canonicalizeSourceEvidence(date.source) }
							: {}),
					})),
				}
			: {}),
		...("verification" in policy && policy.verification
			? {
					verification: canonicalizeRecordVerification(
						policy.verification,
					),
				}
			: {}),
	} as T;
}

function canonicalizeTimelineRecord<T extends TimelineEvent | TimelineEventDraft>(
	event: T,
): T {
	return {
		...event,
		sourceUrl: canonicalizeSourceUrl(event.sourceUrl),
		...("verification" in event && event.verification
			? {
					verification: canonicalizeRecordVerification(
						event.verification,
					),
				}
			: {}),
	} as T;
}

function canonicalizeDevelopmentRecord(development: Development): Development {
	return {
		...development,
		url: canonicalizeSourceUrl(development.url),
		verification: canonicalizeRecordVerification(development.verification),
	};
}

function canonicalizeSourceReviewRecord(review: SourceReview): SourceReview {
	return {
		...review,
		...(review.entryKind === "timeline_event" &&
		review.targetTimelineRevisionHash
			? {
					targetTimelineEventId:
						review.targetTimelineEventId ??
						(review.proposedRecord as TimelineEventDraft).id,
				}
			: {}),
		sourceUrl: canonicalizeSourceUrl(review.sourceUrl),
		sourceEvidence: canonicalizeSourceEvidence(review.sourceEvidence),
		proposedRecord:
			review.entryKind === "policy"
				? canonicalizePolicyRecord(review.proposedRecord as PolicyDraft)
				: canonicalizeTimelineRecord(
						review.proposedRecord as TimelineEventDraft,
					),
		...(review.linkedDevelopment
			? {
					linkedDevelopment: canonicalizeDevelopmentRecord(
						review.linkedDevelopment,
					),
				}
			: {}),
	};
}

/** Public register reads contain only records that passed editorial verification. */
function isPublicPolicy(policy: Policy, now: Date): boolean {
	return (
		policy.status !== "trashed" &&
		isVerificationCurrent(policy.verification, now)
	);
}

function applyPublicPolicyFilter(
	policies: Policy[],
	withheldPolicyIds: Set<string>,
	now: Date,
): Policy[] {
	const visible = policies.filter(
		(policy) =>
			isPublicPolicy(policy, now) && !withheldPolicyIds.has(policy.id),
	);
	const visibleIds = new Set(visible.map((policy) => policy.id));
	return visible.map((policy) =>
		policy.supersededBy && !visibleIds.has(policy.supersededBy)
			? { ...policy, supersededBy: undefined }
			: policy,
	);
}

async function getWithheldPolicyIds(
	policies: readonly Policy[],
): Promise<Set<string>> {
	const reviews = await readSourceReviewsFromJson();
	const withheld = new Set<string>();
	for (const review of reviews) {
		if (
			review.status !== "pending_review" &&
			review.status !== "approved"
		) {
			continue;
		}
		if (review.targetPolicyId) {
			const canonical = policies.find(
				(policy) => policy.id === review.targetPolicyId,
			);
			if (
				canonical &&
				sourceUrlsEqual(canonical.sourceUrl, review.sourceUrl)
			) {
				withheld.add(review.targetPolicyId);
			}
		} else if (review.status === "approved" && review.entryKind === "policy") {
			const proposed = review.proposedRecord as PolicyDraft;
			const canonical = policies.find((policy) => policy.id === proposed.id);
			if (
				canonical &&
				sourceUrlsEqual(canonical.sourceUrl, proposed.sourceUrl) &&
				policyRevisionHash(canonical) ===
					policyRevisionHash(proposed as Policy)
			) {
				withheld.add(proposed.id);
			}
		}
	}
	return withheld;
}

async function getWithheldTimelineEventIds(
	events: readonly TimelineEvent[],
): Promise<Set<string>> {
	const reviews = await readSourceReviewsFromJson();
	const withheld = new Set<string>();
	for (const review of reviews) {
		if (
			(review.status === "pending_review" || review.status === "approved") &&
			review.entryKind === "timeline_event" &&
			review.targetTimelineRevisionHash
		) {
			const proposed = review.proposedRecord as TimelineEventDraft;
			const targetId = review.targetTimelineEventId ?? proposed.id;
			const canonical = events.find((event) => event.id === targetId);
			if (
				canonical &&
				sourceUrlsEqual(canonical.sourceUrl, review.sourceUrl)
			) {
				withheld.add(canonical.id);
			}
			continue;
		}
		if (
			review.status !== "approved" ||
			review.entryKind !== "timeline_event"
		) {
			continue;
		}
		const proposed = review.proposedRecord as TimelineEvent;
		const canonical = events.find((event) => event.id === proposed.id);
		if (
			canonical &&
			sourceUrlsEqual(canonical.sourceUrl, proposed.sourceUrl) &&
			(timelineRevisionHash(canonical) === timelineRevisionHash(proposed) ||
				timelineRevisionHash(canonical) ===
					review.targetTimelineRevisionHash)
		) {
			withheld.add(proposed.id);
		}
	}
	return withheld;
}

function toPublicAgencies(
	agencies: Agency[],
	now: Date,
	publicPolicyIds: Set<string>,
): Agency[] {
	return agencies.map((agency) => {
		const verification = projectVerificationForPublic(
			agency.verification,
			now,
		);
		const isVerified = verification.status === "verified";
		const policies = isVerified
			? agency.policies?.filter((id) => publicPolicyIds.has(id))
			: undefined;
		return {
			id: agency.id,
			name: agency.name,
			acronym: agency.acronym,
			level: agency.level,
			jurisdiction: agency.jurisdiction,
			aiTransparencyStatement: isVerified
				? agency.aiTransparencyStatement
				: undefined,
			aiUsageDisclosure: isVerified
				? agency.aiUsageDisclosure
				: undefined,
			website: agency.website,
			policies: policies?.length ? policies : undefined,
			transparencyStatementUrl: isVerified
				? agency.transparencyStatementUrl
				: undefined,
			lastUpdated: isVerified ? agency.lastUpdated : undefined,
			hasPublishedStatement: isVerified
				? agency.hasPublishedStatement
				: undefined,
			accountableOfficial: isVerified
				? agency.accountableOfficial
				: undefined,
			contactEmail: isVerified ? agency.contactEmail : undefined,
			auditFindings: isVerified ? agency.auditFindings : undefined,
			verification,
		};
	});
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const POLICIES_FILE = path.join(
	process.cwd(),
	"data",
	"policies.json",
);
const AGENCIES_FILE = path.join(
	process.cwd(),
	"data",
	"agencies.json",
);
const COMMONWEALTH_AGENCIES_FILE = path.join(
	process.cwd(),
	"data",
	"commonwealth-agencies.json",
);
const TIMELINE_FILE = path.join(
	process.cwd(),
	"data",
	"timeline.json",
);
const DEVELOPMENTS_FILE = path.join(
	process.cwd(),
	"data",
	"developments.json",
);
const POLICY_FRAMEWORK_FILE = path.join(
	process.cwd(),
	"data",
	"dta-ai-policy-framework.json",
);
const META_FILE = path.join(process.cwd(), "public", "data", "meta.json");
const SOURCE_REVIEWS_FILE = path.join(
	process.cwd(),
	"data",
	"source-reviews.json",
);
const SOURCE_MONITORING_FILE = path.join(
	process.cwd(),
	"data",
	"source-monitoring.json",
);
const LEGACY_PENDING_CONTENT_FILE = path.join(
	process.cwd(),
	"public",
	"data",
	"pending-content.json",
);
const MCP_AUDIT_LOG_FILE = path.join(
	process.cwd(),
	"data",
	"mcp-audit-log.json",
);

// ---------------------------------------------------------------------------
// Policy operations
// ---------------------------------------------------------------------------

export interface PolicyFilters {
	jurisdiction?: string;
	type?: string;
	status?: string;
	search?: string;
}

interface PolicyWithTrash extends Policy {
	trashedAt?: string;
}

export class DuplicatePolicyError extends Error {
	constructor(id: string) {
		super(`Policy already exists: ${id}`);
		this.name = "DuplicatePolicyError";
	}
}

export async function getPolicies(
	filters?: PolicyFilters,
	options: DataServiceOptions = {},
): Promise<Policy[]> {
	const access = options.access ?? "public";
	const now = options.now ?? new Date();

	let policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	if (access === "public") {
		policies = applyPublicPolicyFilter(
			policies,
			await getWithheldPolicyIds(policies),
			now,
		);
	}

	if (filters?.jurisdiction) {
		policies = policies.filter((p) => p.jurisdiction === filters.jurisdiction);
	}
	if (filters?.type) {
		policies = policies.filter((p) => p.type === filters.type);
	}
	if (filters?.status) {
		policies = policies.filter((p) => p.status === filters.status);
	}
	if (filters?.search) {
		const q = filters.search.toLowerCase();
		policies = policies.filter(
			(p) =>
				p.title.toLowerCase().includes(q) ||
				p.description.toLowerCase().includes(q) ||
				p.tags.some((t: string) => t.toLowerCase().includes(q)),
		);
	}

	return policies.sort(
		(a, b) =>
			new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime(),
	);
}

export async function getPolicyById(
	id: string,
	options: DataServiceOptions = {},
): Promise<Policy | null> {
	const access = options.access ?? "public";
	const now = options.now ?? new Date();
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	if (access === "public") {
		const projected = applyPublicPolicyFilter(
			policies,
			await getWithheldPolicyIds(policies),
			now,
		);
		return projected.find((policy) => policy.id === id) ?? null;
	}
	return policies.find((policy) => policy.id === id) ?? null;
}

export async function getPolicyBySourceUrl(
	sourceUrl: string,
	options: DataServiceOptions = {},
): Promise<Policy | null> {
	const access = options.access ?? "public";
	const now = options.now ?? new Date();
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	if (access === "public") {
		const projected = applyPublicPolicyFilter(
			policies,
			await getWithheldPolicyIds(policies),
			now,
		);
		return (
			projected.find((policy) =>
				sourceUrlsEqual(policy.sourceUrl, sourceUrl),
			) ?? null
		);
	}
	return (
		policies.find((policy) => sourceUrlsEqual(policy.sourceUrl, sourceUrl)) ??
		null
	);
}

export async function createPolicy(policy: Policy): Promise<Policy> {
	const normalized = canonicalizePolicyRecord(policy);
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	if (
		policies.some(
			(existingPolicy) =>
				existingPolicy.id === normalized.id ||
				sourceUrlsEqual(existingPolicy.sourceUrl, normalized.sourceUrl),
		)
	) {
		throw new DuplicatePolicyError(normalized.id);
	}
	policies.unshift(normalized);
	await writeJsonFile(POLICIES_FILE, policies);
	return normalized;
}

export async function updatePolicy(
	id: string,
	updates: Partial<PolicyWithTrash>,
): Promise<Policy | null> {
	const policies = await readJsonFile<PolicyWithTrash[]>(POLICIES_FILE, []);
	const idx = policies.findIndex((p) => p.id === id);
	if (idx === -1) return null;

	const now = new Date().toISOString();
	if (updates.status === "trashed" && policies[idx].status !== "trashed") {
		policies[idx].trashedAt = now;
	} else if (
		updates.status &&
		updates.status !== "trashed" &&
		policies[idx].status === "trashed"
	) {
		delete policies[idx].trashedAt;
	}

	policies[idx] = canonicalizePolicyRecord({
		...policies[idx],
		...updates,
		updatedAt: updates.updatedAt ?? now,
	});
	await writeJsonFile(POLICIES_FILE, policies);
	return policies[idx];
}

export async function deletePolicy(id: string): Promise<boolean> {
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	const idx = policies.findIndex((p) => p.id === id);
	if (idx === -1) return false;
	policies.splice(idx, 1);
	await writeJsonFile(POLICIES_FILE, policies);
	return true;
}

/** Check if a policy with a given ID already exists. */
export async function policyExists(id: string): Promise<boolean> {
	const policy = await getPolicyById(id, { access: "admin" });
	return policy !== null;
}

export async function policyExistsBySourceUrl(
	sourceUrl: string,
): Promise<boolean> {
	const policy = await getPolicyBySourceUrl(sourceUrl, { access: "admin" });
	return policy !== null;
}

// ---------------------------------------------------------------------------
// Source review operations
// ---------------------------------------------------------------------------

interface LegacyPendingItem {
	id: string;
	title: string;
	source: string;
	discoveredAt: string;
	status: "pending_review" | "approved" | "rejected";
	aiAnalysis: SourceReview["analysis"];
}

function createPolicyFromReview(item: LegacyPendingItem): PolicyDraft {
	const now = new Date().toISOString();
	const id = item.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 50);

	return {
		id,
		title: item.title,
		description: item.aiAnalysis.summary,
		jurisdiction: normalizeJurisdiction(item.aiAnalysis.suggestedJurisdiction),
		type: normalizePolicyType(item.aiAnalysis.suggestedType),
		status: "active",
		agencies: item.aiAnalysis.agencies || [],
		sourceUrl: item.source,
		content: item.aiAnalysis.summary,
		aiSummary: item.aiAnalysis.summary,
		tags: item.aiAnalysis.tags || [],
		createdAt: now,
		updatedAt: now,
	};
}

function legacyPendingToSourceReview(item: LegacyPendingItem): SourceReview {
	return {
		id: item.id,
		sourceUrl: item.source,
		title: item.title,
		entryKind: "policy",
		status: item.status,
		discoveredAt: item.discoveredAt,
		createdBy: "legacy-admin-review",
		analysis: item.aiAnalysis,
		sourceEvidence: { url: item.source },
		proposedRecord: createPolicyFromReview(item),
		updatedAt: item.discoveredAt,
	};
}

async function readSourceReviewsFromJson(): Promise<SourceReview[]> {
	const reviews = await readJsonFile<SourceReview[]>(SOURCE_REVIEWS_FILE, []);
	if (reviews.length > 0) return reviews;

	const legacyItems = await readJsonFile<LegacyPendingItem[]>(
		LEGACY_PENDING_CONTENT_FILE,
		[],
	);
	return legacyItems.map(legacyPendingToSourceReview);
}

export async function getSourceReviews(filters?: {
	status?: SourceReviewStatus;
}): Promise<SourceReview[]> {
	let reviews = await readSourceReviewsFromJson();
	if (filters?.status) {
		reviews = reviews.filter((review) => review.status === filters.status);
	}
	return reviews.sort(
		(a, b) =>
			new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime(),
	);
}

export async function getSourceReviewById(
	id: string,
): Promise<SourceReview | null> {
	const reviews = await readSourceReviewsFromJson();
	return reviews.find((review) => review.id === id) || null;
}

export async function createSourceReview(
	review: SourceReview,
): Promise<SourceReview> {
	const normalized = canonicalizeSourceReviewRecord(review);
	if (
		!normalized.targetPolicyId &&
		!normalized.targetTimelineEventId &&
		!normalized.targetTimelineRevisionHash &&
		(await sourceUrlExists(normalized.sourceUrl))
	) {
		throw new DuplicatePolicyError(normalized.sourceUrl);
	}

	const reviews = await readSourceReviewsFromJson();
	if (
		reviews.some(
			(existing) =>
				existing.id === normalized.id ||
				(!normalized.targetPolicyId &&
					!normalized.targetTimelineEventId &&
					!normalized.targetTimelineRevisionHash &&
					sourceUrlsEqual(existing.sourceUrl, normalized.sourceUrl) &&
					existing.status !== "rejected"),
		)
	) {
		throw new DuplicatePolicyError(normalized.sourceUrl);
	}
	reviews.unshift(normalized);
	await writeJsonFile(SOURCE_REVIEWS_FILE, reviews);
	return normalized;
}

export async function updateSourceReview(
	id: string,
	updates: Partial<SourceReview>,
): Promise<SourceReview | null> {
	const nextUpdates = { ...updates, updatedAt: new Date().toISOString() };

	const reviews = await readSourceReviewsFromJson();
	const idx = reviews.findIndex((review) => review.id === id);
	if (idx === -1) return null;
	reviews[idx] = canonicalizeSourceReviewRecord({
		...reviews[idx],
		...nextUpdates,
	});
	await writeJsonFile(SOURCE_REVIEWS_FILE, reviews);
	return reviews[idx];
}

export async function deleteSourceReview(id: string): Promise<boolean> {
	const reviews = await readSourceReviewsFromJson();
	const filtered = reviews.filter((review) => review.id !== id);
	if (filtered.length === reviews.length) return false;
	await writeJsonFile(SOURCE_REVIEWS_FILE, filtered);
	return true;
}

export async function sourceUrlExists(
	sourceUrl: string,
	options: {
		excludeSourceReviewId?: string;
	} = {},
): Promise<boolean> {
	if (await policyExistsBySourceUrl(sourceUrl)) return true;

	const timelineEvents = await getTimelineEvents(undefined, {
		includeGenerated: false,
		access: "admin",
	});
	if (
		timelineEvents.some((event) =>
			sourceUrlsEqual(event.sourceUrl, sourceUrl),
		)
	)
		return true;

	const sourceReviews = await getSourceReviews();
	return sourceReviews.some(
		(review) =>
			sourceUrlsEqual(review.sourceUrl, sourceUrl) &&
			review.id !== options.excludeSourceReviewId &&
			review.status !== "rejected",
	);
}

// ---------------------------------------------------------------------------
// Agency operations
// ---------------------------------------------------------------------------

export async function getAgencies(
	filters?: {
		level?: string;
		jurisdiction?: string;
	},
	options: DataServiceOptions = {},
): Promise<Agency[]> {
	const access = options.access ?? "public";
	const now = options.now ?? new Date();

	let agencies = await readJsonFile<Agency[]>(AGENCIES_FILE, []);
	if (filters?.level) {
		agencies = agencies.filter((a) => a.level === filters.level);
	}
	if (filters?.jurisdiction) {
		agencies = agencies.filter((a) => a.jurisdiction === filters.jurisdiction);
	}
	const sorted = agencies.sort((a, b) => a.name.localeCompare(b.name));
	if (access === "admin") return sorted;
	const publicPolicyIds = sorted.some((agency) => agency.policies?.length)
		? new Set(
				(await getPolicies(undefined, { now })).map(
					(policy) => policy.id,
				),
			)
		: new Set<string>();
	return toPublicAgencies(sorted, now, publicPolicyIds);
}

export async function getCommonwealthAgencies(
	options: DataServiceOptions = {},
): Promise<Agency[]> {
	const access = options.access ?? "public";
	const now = options.now ?? new Date();
	const agencies = await readJsonFile<Agency[]>(COMMONWEALTH_AGENCIES_FILE, []);
	if (access === "admin") return agencies;
	const publicPolicyIds = agencies.some((agency) => agency.policies?.length)
		? new Set(
				(await getPolicies(undefined, { now })).map(
					(policy) => policy.id,
				),
			)
		: new Set<string>();
	return toPublicAgencies(agencies, now, publicPolicyIds);
}

// ---------------------------------------------------------------------------
// Timeline operations
// ---------------------------------------------------------------------------

async function getManualTimelineEvents(): Promise<TimelineEvent[]> {
	return readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
}

function generatedTimelineEvent(
	policy: Policy,
): {
	type: TimelineEventType;
	date: Date | string;
	precision: DatePrecision;
} {
	const primaryDate = policy.dates.find((date) => date.primary);
	if (!primaryDate) {
		return {
			type: "policy_introduced",
			date: policy.effectiveDate,
			precision: "day",
		};
	}
	if (policy.status === "repealed") {
		const repealedDate = policy.dates.find(
			(date) => date.type === "repealed",
		);
		if (repealedDate) {
			return {
				type: "policy_repealed",
				date: repealedDate.date,
				precision: repealedDate.precision,
			};
		}
	}
	if (policy.status === "superseded") {
		const supersededDate = policy.dates.find(
			(date) => date.type === "superseded",
		);
		if (supersededDate) {
			return {
				type: "policy_superseded",
				date: supersededDate.date,
				precision: supersededDate.precision,
			};
		}
	}
	const amendedDate =
		primaryDate.type === "amended"
			? primaryDate
			: policy.status === "amended"
				? policy.dates.find((date) => date.type === "amended")
				: undefined;
	if (amendedDate) {
		return {
			type: "policy_amended",
			date: amendedDate.date,
			precision: amendedDate.precision,
		};
	}
	return {
		type: "policy_introduced",
		date: primaryDate.date,
		precision: primaryDate.precision,
	};
}

export async function createTimelineEvent(
	event: TimelineEvent,
	options: {
		excludeSourceReviewId?: string;
	} = {},
): Promise<TimelineEvent> {
	const normalized = canonicalizeTimelineRecord(event);
	if (
		normalized.sourceUrl &&
		(await sourceUrlExists(normalized.sourceUrl, options))
	) {
		throw new DuplicatePolicyError(normalized.sourceUrl);
	}

	const events = await readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
	if (
		events.some(
			(existing) =>
				existing.id === normalized.id ||
				(normalized.sourceUrl &&
					sourceUrlsEqual(existing.sourceUrl, normalized.sourceUrl)),
		)
	) {
		throw new DuplicatePolicyError(normalized.id);
	}
	events.push(normalized);
	await writeJsonFile(TIMELINE_FILE, events);
	return normalized;
}

export async function updateTimelineEvent(
	id: string,
	event: TimelineEvent,
): Promise<TimelineEvent | null> {
	const events = await readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
	const index = events.findIndex((existing) => existing.id === id);
	if (index === -1) return null;
	events[index] = canonicalizeTimelineRecord(event);
	await writeJsonFile(TIMELINE_FILE, events);
	return events[index];
}

export async function getTimelineEvents(
	filters?: {
		jurisdiction?: string;
	},
	options: {
		includeGenerated?: boolean;
		access?: DataAccess;
		now?: Date;
	} = {},
): Promise<TimelineEvent[]> {
	const includeGenerated = options.includeGenerated ?? true;
	const access = options.access ?? "public";
	const now = options.now ?? new Date();
	// Generate timeline events from policies + merge with manual curated events
	const visiblePolicies = includeGenerated || access === "public"
		? await getPolicies(undefined, { access, now })
		: [];
	const publicPolicyIds = new Set(
		visiblePolicies.map((policy) => policy.id),
	);
	const policies = includeGenerated ? visiblePolicies : [];
	const allManualEvents = await getManualTimelineEvents();
	const withheldEventIds =
		access === "public"
			? await getWithheldTimelineEventIds(allManualEvents)
			: new Set<string>();
	const manualEvents = allManualEvents
		.filter(
			(event) =>
			access === "admin" ||
			(isVerificationCurrent(event.verification, now) &&
				!withheldEventIds.has(event.id)),
		)
		.map((event) =>
			access === "public" &&
			event.relatedPolicyId &&
			!publicPolicyIds.has(event.relatedPolicyId)
				? { ...event, relatedPolicyId: undefined }
				: event,
		);

	// Build a set of relatedPolicyIds from manual events for dedup
	const manualPolicyIds = new Set(
		manualEvents.filter((e) => e.relatedPolicyId).map((e) => e.relatedPolicyId),
	);

	// Generate timeline events from policies (skip if manual event already covers it)
	const policyEvents: TimelineEvent[] = policies
		.filter((p) => p.effectiveDate && !manualPolicyIds.has(p.id))
		.map((p) => {
			const generated = generatedTimelineEvent(p);
			return {
				id: `policy-timeline-${p.id}`,
				date:
					typeof generated.date === "string"
						? generated.date
						: generated.date.toISOString().split("T")[0],
				datePrecision: generated.precision,
				title: p.title,
				description:
					p.description.length > 200
						? p.description.slice(0, 197) + "..."
						: p.description,
				type: generated.type,
				jurisdiction: p.jurisdiction,
				relatedPolicyId: p.id,
				sourceUrl: p.sourceUrl,
				verification: p.verification,
			};
		});

	let events = [...manualEvents, ...policyEvents];

	if (filters?.jurisdiction) {
		events = events.filter((e) => e.jurisdiction === filters.jurisdiction);
	}

	return events.sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);
}

// ---------------------------------------------------------------------------
// Developments feed + collection metadata
// ---------------------------------------------------------------------------

export async function getDevelopments(filters?: {
	jurisdiction?: string;
	status?: string;
	limit?: number;
}, options: DataServiceOptions = {}): Promise<Development[]> {
	const access = options.access ?? "public";
	const now = options.now ?? new Date();
	let developments = await readJsonFile<Development[]>(DEVELOPMENTS_FILE, []);
	if (access === "public") {
		// Terminal review state is authoritative even if a recoverable development
		// side-effect write failed. Derive the safe public projection from both
		// files so an editorial rejection can never remain visible.
		const sourceReviews = await readJsonFile<SourceReview[]>(
			SOURCE_REVIEWS_FILE,
			[],
		);
		developments = reconcileLinkedDevelopments(sourceReviews, developments);
		const relatedPolicyIds = new Set(
			developments
				.map((development) => development.relatedPolicyId)
				.filter((id): id is string => Boolean(id)),
		);
		const relatedTimelineEventIds = new Set(
			developments
				.map((development) => development.relatedTimelineEventId)
				.filter((id): id is string => Boolean(id)),
		);
		const [publicPolicyIds, publicTimelineEventIds] = await Promise.all([
			relatedPolicyIds.size > 0
				? getPolicies(undefined, { now }).then(
						(policies) => new Set(policies.map((policy) => policy.id)),
					)
				: Promise.resolve(new Set<string>()),
			relatedTimelineEventIds.size > 0
				? getTimelineEvents(undefined, {
						includeGenerated: false,
						now,
					}).then((events) => new Set(events.map((event) => event.id)))
				: Promise.resolve(new Set<string>()),
		]);
		developments = developments
			.filter((development) => development.status !== "dismissed")
			.map((development) => {
					const relatedPolicyWithheld = Boolean(
						development.relatedPolicyId &&
							!publicPolicyIds.has(development.relatedPolicyId),
					);
					const relatedTimelineEventWithheld = Boolean(
						development.relatedTimelineEventId &&
							!publicTimelineEventIds.has(
								development.relatedTimelineEventId,
							),
					);
					const relationshipWithheld =
						relatedPolicyWithheld || relatedTimelineEventWithheld;
				const projectedVerification = projectVerificationForPublic(
					development.verification,
					now,
				);
				return {
					...development,
						relatedPolicyId: relatedPolicyWithheld
							? undefined
							: development.relatedPolicyId,
						relatedTimelineEventId: relatedTimelineEventWithheld
							? undefined
							: development.relatedTimelineEventId,
					verification:
						relationshipWithheld &&
						projectedVerification.status === "verified"
							? {
									...projectedVerification,
									status: "stale" as const,
									notes: relatedTimelineEventWithheld
										? "The related timeline event is withheld pending re-verification."
										: "The related policy is withheld pending re-verification.",
								}
							: projectedVerification,
				};
			});
	}

	if (filters?.jurisdiction) {
		developments = developments.filter(
			(d) => d.jurisdiction === filters.jurisdiction,
		);
	}
	if (filters?.status) {
		developments = developments.filter((d) => d.status === filters.status);
	}

	developments = developments.sort(
		(a, b) =>
			new Date(b.publishedAt || b.detectedAt).getTime() -
			new Date(a.publishedAt || a.detectedAt).getTime(),
	);

	return filters?.limit ? developments.slice(0, filters.limit) : developments;
}

export async function updateDevelopment(
	id: string,
	updates: Partial<Development>,
): Promise<Development | null> {
	const developments = await readJsonFile<Development[]>(
		DEVELOPMENTS_FILE,
		[],
	);
	const index = developments.findIndex(
		(development) => development.id === id,
	);
	if (index === -1) return null;
	developments[index] = canonicalizeDevelopmentRecord({
		...developments[index],
		...updates,
	});
	await writeJsonFile(DEVELOPMENTS_FILE, developments);
	return developments[index];
}

export async function upsertDevelopment(
	development: Development,
): Promise<Development> {
	const normalized = canonicalizeDevelopmentRecord(development);
	const developments = await readJsonFile<Development[]>(
		DEVELOPMENTS_FILE,
		[],
	);
	const index = developments.findIndex(
		(candidate) => candidate.id === normalized.id,
	);
	if (index === -1) {
		developments.unshift(normalized);
	} else {
		developments[index] = normalized;
	}
	await writeJsonFile(DEVELOPMENTS_FILE, developments);
	return normalized;
}

export async function getPolicyFrameworkArtifact(
	options: DataServiceOptions = {},
): Promise<Record<string, unknown> | null> {
	const artifact = await readJsonFile<Record<string, unknown>>(
		POLICY_FRAMEWORK_FILE,
		{},
	);
	if (options.access === "admin") return artifact;
	const relatedPolicyId = artifact.relatedPolicyId;
	if (typeof relatedPolicyId !== "string") return null;
	const relatedPolicy = await getPolicyById(relatedPolicyId, {
		now: options.now,
	});
	if (!relatedPolicy) return null;
	const artifactVerification =
		artifact.verification as RecordVerification | undefined;
	if (
		!artifactVerification ||
		!isVerificationCurrent(
			artifactVerification,
			options.now ?? new Date(),
		)
	) {
		return null;
	}
	const artifactCheckedAt = new Date(
		artifactVerification.checkedAt ?? "",
	).getTime();
	const policyCheckedAt = new Date(
		relatedPolicy.verification.checkedAt ?? "",
	).getTime();
	if (
		!Number.isFinite(artifactCheckedAt) ||
		!Number.isFinite(policyCheckedAt) ||
		artifactCheckedAt < policyCheckedAt
	) {
		return null;
	}
	const artifactHash = artifactVerification.source.contentHash;
	const policyHash = relatedPolicy.verification.source.contentHash;
	if (artifactHash && policyHash && artifactHash !== policyHash) {
		return null;
	}
	return artifact;
}

const EMPTY_META: CollectionMeta = {
	lastCollectedAt: null,
	lastHealthyAt: null,
	lastReviewedAt: null,
	collector: {
		runCount: 0,
		lastRunSources: [],
		lastRunErrors: [],
		health: "failed",
		dueSourceCount: 0,
		successfulSourceCount: 0,
		failedSourceCount: 0,
		skippedSourceCount: 0,
		successRate: 0,
		automaticSourceCount: 0,
		manualSourceCount: 0,
		sourceResults: [],
	},
};

export async function getCollectionMeta(): Promise<CollectionMeta> {
	return readJsonFile<CollectionMeta>(META_FILE, EMPTY_META);
}

export async function getSourceMonitoring(): Promise<SourceMonitoringState> {
	return readJsonFile<SourceMonitoringState>(SOURCE_MONITORING_FILE, {
		manualReviews: [],
	});
}

export async function upsertManualSourceReview(
	review: ManualSourceReview,
): Promise<SourceMonitoringState> {
	const monitoring = await getSourceMonitoring();
	const normalizedReview: ManualSourceReview = {
		...review,
		...(review.evidence
			? { evidence: canonicalizeSourceEvidence(review.evidence) }
			: {}),
	};
	const existing = monitoring.manualReviews.find(
		(candidate) => candidate.sourceId === normalizedReview.sourceId,
	);
	const existingEvidence = existing?.evidence
		? canonicalizeSourceEvidence(existing.evidence)
		: undefined;
	const reusableExistingEvidence =
		existingEvidence &&
		(!normalizedReview.evidence ||
			sourceUrlsEqual(
				existingEvidence.url,
				normalizedReview.evidence.url,
			))
			? existingEvidence
			: undefined;
	const currentEvidence =
		normalizedReview.evidence ?? reusableExistingEvidence;
	const merged: ManualSourceReview = {
		...normalizedReview,
		...(currentEvidence
			? {
					evidence: {
						...reusableExistingEvidence,
						...normalizedReview.evidence,
						url: currentEvidence.url,
					},
				}
			: {}),
	};
	const remaining = monitoring.manualReviews.filter(
		(existing) => existing.sourceId !== normalizedReview.sourceId,
	);
	const updated = { manualReviews: [merged, ...remaining] };
	await writeJsonFile(SOURCE_MONITORING_FILE, updated);
	return updated;
}

export async function markCollectionReviewed(
	reviewedAt: string,
): Promise<CollectionMeta> {
	const meta = await getCollectionMeta();
	const lastReviewedAt =
		meta.lastReviewedAt &&
		new Date(meta.lastReviewedAt).getTime() > new Date(reviewedAt).getTime()
			? meta.lastReviewedAt
			: reviewedAt;
	const updated = { ...meta, lastReviewedAt };
	await writeJsonFile(META_FILE, updated);
	return updated;
}

// ---------------------------------------------------------------------------
// MCP audit logging
// ---------------------------------------------------------------------------

export async function logMcpAuditEvent(log: McpAuditLog): Promise<void> {
	const logs = await readJsonFile<McpAuditLog[]>(MCP_AUDIT_LOG_FILE, []);
	logs.unshift(log);
	await writeJsonFile(MCP_AUDIT_LOG_FILE, logs.slice(0, 500));
}
