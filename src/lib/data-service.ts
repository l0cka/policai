/**
 * Data Service — file-backed reads and writes over the repo's JSON data.
 *
 * Git is the database: the JSON files under `public/data/` are the canonical
 * store, versioned with the code and deployed as static assets. Local tools
 * (the MCP source-ingest server, the collector CLI) write to these files and
 * publish by committing; the deployed site only ever reads them.
 */

import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/file-store";
import {
	normalizeJurisdiction,
	normalizePolicyType,
	type Agency,
	type CollectionMeta,
	type Development,
	type McpAuditLog,
	type Policy,
	type SourceReview,
	type SourceReviewStatus,
	type TimelineEvent,
} from "@/types";

type DataAccess = "public" | "admin";

interface DataServiceOptions {
	access?: DataAccess;
}

/** Trashed policies are the only records hidden from public reads. */
function isPublicPolicy(policy: Policy): boolean {
	return policy.status !== "trashed";
}

function applyPublicPolicyFilter(policies: Policy[]): Policy[] {
	return policies.filter(isPublicPolicy);
}

function toPublicAgencies(agencies: Agency[]): Agency[] {
	return agencies.map((agency) => ({
		id: agency.id,
		name: agency.name,
		acronym: agency.acronym,
		level: agency.level,
		jurisdiction: agency.jurisdiction,
		aiTransparencyStatement: agency.aiTransparencyStatement,
		aiUsageDisclosure: agency.aiUsageDisclosure,
		website: agency.website,
		policies: agency.policies,
		transparencyStatementUrl: agency.transparencyStatementUrl,
		lastUpdated: agency.lastUpdated,
		hasPublishedStatement: agency.hasPublishedStatement,
	}));
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const POLICIES_FILE = path.join(
	process.cwd(),
	"public",
	"data",
	"policies.json",
);
const AGENCIES_FILE = path.join(
	process.cwd(),
	"public",
	"data",
	"agencies.json",
);
const COMMONWEALTH_AGENCIES_FILE = path.join(
	process.cwd(),
	"public",
	"data",
	"commonwealth-agencies.json",
);
const TIMELINE_FILE = path.join(
	process.cwd(),
	"public",
	"data",
	"timeline.json",
);
const DEVELOPMENTS_FILE = path.join(
	process.cwd(),
	"public",
	"data",
	"developments.json",
);
const META_FILE = path.join(process.cwd(), "public", "data", "meta.json");
const SOURCE_REVIEWS_FILE = path.join(
	process.cwd(),
	"data",
	"source-reviews.json",
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

	let policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	if (access === "public") {
		policies = applyPublicPolicyFilter(policies);
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
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	const policy = policies.find((p) => p.id === id) || null;
	if (policy && access === "public" && !isPublicPolicy(policy)) return null;
	return policy;
}

export async function getPolicyBySourceUrl(
	sourceUrl: string,
	options: DataServiceOptions = {},
): Promise<Policy | null> {
	const access = options.access ?? "public";
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	const policy = policies.find((p) => p.sourceUrl === sourceUrl) || null;
	if (policy && access === "public" && !isPublicPolicy(policy)) return null;
	return policy;
}

export async function createPolicy(policy: Policy): Promise<Policy> {
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	if (policies.some((existingPolicy) => existingPolicy.id === policy.id)) {
		throw new DuplicatePolicyError(policy.id);
	}
	policies.unshift(policy);
	await writeJsonFile(POLICIES_FILE, policies);
	return policy;
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

	policies[idx] = { ...policies[idx], ...updates, updatedAt: now };
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

function createPolicyFromReview(item: LegacyPendingItem): Policy {
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
		effectiveDate: item.discoveredAt.split("T")[0] || now.split("T")[0],
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
	if (await sourceUrlExists(review.sourceUrl)) {
		throw new DuplicatePolicyError(review.sourceUrl);
	}

	const reviews = await readSourceReviewsFromJson();
	if (
		reviews.some(
			(existing) =>
				existing.id === review.id || existing.sourceUrl === review.sourceUrl,
		)
	) {
		throw new DuplicatePolicyError(review.sourceUrl);
	}
	reviews.unshift(review);
	await writeJsonFile(SOURCE_REVIEWS_FILE, reviews);
	return review;
}

export async function updateSourceReview(
	id: string,
	updates: Partial<SourceReview>,
): Promise<SourceReview | null> {
	const nextUpdates = { ...updates, updatedAt: new Date().toISOString() };

	const reviews = await readSourceReviewsFromJson();
	const idx = reviews.findIndex((review) => review.id === id);
	if (idx === -1) return null;
	reviews[idx] = { ...reviews[idx], ...nextUpdates };
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
	});
	if (timelineEvents.some((event) => event.sourceUrl === sourceUrl))
		return true;

	const sourceReviews = await getSourceReviews();
	return sourceReviews.some(
		(review) =>
			review.sourceUrl === sourceUrl &&
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

	let agencies = await readJsonFile<Agency[]>(AGENCIES_FILE, []);
	if (filters?.level) {
		agencies = agencies.filter((a) => a.level === filters.level);
	}
	if (filters?.jurisdiction) {
		agencies = agencies.filter((a) => a.jurisdiction === filters.jurisdiction);
	}
	const sorted = agencies.sort((a, b) => a.name.localeCompare(b.name));
	return access === "admin" ? sorted : toPublicAgencies(sorted);
}

export async function getCommonwealthAgencies(
	options: DataServiceOptions = {},
): Promise<Agency[]> {
	const access = options.access ?? "public";
	const agencies = await readJsonFile<Agency[]>(COMMONWEALTH_AGENCIES_FILE, []);
	return access === "admin" ? agencies : toPublicAgencies(agencies);
}

// ---------------------------------------------------------------------------
// Timeline operations
// ---------------------------------------------------------------------------

async function getManualTimelineEvents(): Promise<TimelineEvent[]> {
	return readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
}

export async function createTimelineEvent(
	event: TimelineEvent,
	options: {
		excludeSourceReviewId?: string;
	} = {},
): Promise<TimelineEvent> {
	if (event.sourceUrl && (await sourceUrlExists(event.sourceUrl, options))) {
		throw new DuplicatePolicyError(event.sourceUrl);
	}

	const events = await readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
	if (
		events.some(
			(existing) =>
				existing.id === event.id ||
				(event.sourceUrl && existing.sourceUrl === event.sourceUrl),
		)
	) {
		throw new DuplicatePolicyError(event.id);
	}
	events.push(event);
	await writeJsonFile(TIMELINE_FILE, events);
	return event;
}

export async function getTimelineEvents(
	filters?: {
		jurisdiction?: string;
	},
	options: {
		includeGenerated?: boolean;
	} = {},
): Promise<TimelineEvent[]> {
	const includeGenerated = options.includeGenerated ?? true;
	// Generate timeline events from policies + merge with manual curated events
	const policies = includeGenerated ? await getPolicies() : [];
	const manualEvents = await getManualTimelineEvents();

	// Build a set of relatedPolicyIds from manual events for dedup
	const manualPolicyIds = new Set(
		manualEvents.filter((e) => e.relatedPolicyId).map((e) => e.relatedPolicyId),
	);

	// Generate timeline events from policies (skip if manual event already covers it)
	const policyEvents: TimelineEvent[] = policies
		.filter((p) => p.effectiveDate && !manualPolicyIds.has(p.id))
		.map((p) => ({
			id: `policy-timeline-${p.id}`,
			date:
				typeof p.effectiveDate === "string"
					? p.effectiveDate
					: new Date(p.effectiveDate).toISOString().split("T")[0],
			title: p.title,
			description:
				p.description.length > 200
					? p.description.slice(0, 197) + "..."
					: p.description,
			type:
				p.status === "amended"
					? ("policy_amended" as const)
					: ("policy_introduced" as const),
			jurisdiction: p.jurisdiction,
			relatedPolicyId: p.id,
			sourceUrl: p.sourceUrl,
		}));

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
}): Promise<Development[]> {
	let developments = await readJsonFile<Development[]>(DEVELOPMENTS_FILE, []);

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

const EMPTY_META: CollectionMeta = {
	lastCollectedAt: null,
	lastReviewedAt: null,
	collector: { runCount: 0, lastRunSources: [], lastRunErrors: [] },
};

export async function getCollectionMeta(): Promise<CollectionMeta> {
	return readJsonFile<CollectionMeta>(META_FILE, EMPTY_META);
}

// ---------------------------------------------------------------------------
// MCP audit logging
// ---------------------------------------------------------------------------

export async function logMcpAuditEvent(log: McpAuditLog): Promise<void> {
	const logs = await readJsonFile<McpAuditLog[]>(MCP_AUDIT_LOG_FILE, []);
	logs.unshift(log);
	await writeJsonFile(MCP_AUDIT_LOG_FILE, logs.slice(0, 500));
}
