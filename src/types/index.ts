// Core domain types for Policai

export const JURISDICTIONS = [
	"federal",
	"nsw",
	"vic",
	"qld",
	"wa",
	"sa",
	"tas",
	"act",
	"nt",
] as const;

export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const POLICY_TYPES = [
	"legislation",
	"regulation",
	"guideline",
	"framework",
	"standard",
	"practice_note",
	"policy",
	"tool",
	"funding_program",
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_STATUSES = [
	"proposed",
	"active",
	"amended",
	"superseded",
	"closed",
	"repealed",
	"trashed",
] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const TIMELINE_EVENT_TYPES = [
	"policy_introduced",
	"policy_amended",
	"policy_repealed",
	"announcement",
	"milestone",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type AgencyLevel = "federal" | "state";

export interface Policy {
	id: string;
	title: string;
	description: string;
	jurisdiction: Jurisdiction;
	type: PolicyType;
	status: PolicyStatus;
	effectiveDate: Date | string;
	agencies: string[];
	sourceUrl: string;
	content: string;
	aiSummary: string;
	tags: string[];
	createdAt: Date | string;
	updatedAt: Date | string;
	supersededBy?: string;
	lastReviewedAt?: string;
}

export interface Agency {
	id: string;
	name: string;
	acronym: string;
	level: AgencyLevel;
	jurisdiction: Jurisdiction;
	aiTransparencyStatement?: string;
	aiUsageDisclosure?: string;
	website: string;
	policies?: string[];
	transparencyStatementUrl?: string;
	lastUpdated?: string;
	hasPublishedStatement: boolean;
	accountableOfficial?: string;
	contactEmail?: string;
	auditFindings?: string;
}

export interface NewsItem {
	id: string;
	title: string;
	summary: string;
	source: string;
	sourceUrl: string;
	publishedDate: Date | string;
	relevanceScore: number;
	relatedPolicies: string[];
	tags: string[];
}

export interface TimelineEvent {
	id: string;
	date: Date | string;
	title: string;
	description: string;
	type: TimelineEventType;
	jurisdiction: Jurisdiction;
	relatedPolicyId?: string;
	sourceUrl?: string;
}

export const SOURCE_REVIEW_ENTRY_KINDS = ["policy", "timeline_event"] as const;

export type SourceReviewEntryKind = (typeof SOURCE_REVIEW_ENTRY_KINDS)[number];

export const SOURCE_REVIEW_STATUSES = [
	"pending_review",
	"approved",
	"published",
	"rejected",
] as const;

export type SourceReviewStatus = (typeof SOURCE_REVIEW_STATUSES)[number];

export interface SourceReviewAnalysis {
	isRelevant: boolean;
	relevanceScore: number;
	suggestedType: PolicyType | string | null;
	suggestedJurisdiction: Jurisdiction | string | null;
	summary: string;
	tags?: string[];
	agencies?: string[];
}

export interface SourceReview {
	id: string;
	sourceUrl: string;
	title: string;
	entryKind: SourceReviewEntryKind;
	status: SourceReviewStatus;
	discoveredAt: string;
	createdBy: string;
	notes?: string;
	analysis: SourceReviewAnalysis;
	proposedRecord: Policy | TimelineEvent;
	publishedAt?: string;
	rejectionReason?: string;
	updatedAt: string;
}

// Developments radar feed — automated detections from the collector.
// Distinct from the curated policy registry: safe to auto-publish because
// every entry carries provenance and a confidence label.

export const DEVELOPMENT_STATUSES = [
	"detected",
	"promoted",
	"dismissed",
] as const;

export type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number];

export interface Development {
	id: string;
	title: string;
	url: string;
	sourceId: string;
	sourceName: string;
	jurisdiction: Jurisdiction;
	publishedAt?: string;
	detectedAt: string;
	summary?: string;
	relevanceScore: number;
	classification: "ai" | "heuristic";
	status: DevelopmentStatus;
	relatedPolicyId?: string;
}

export interface CollectionMeta {
	lastCollectedAt: string | null;
	lastReviewedAt: string | null;
	collector: {
		runCount: number;
		lastRunSources: string[];
		lastRunErrors: string[];
	};
}

export function isDevelopmentStatus(
	value: string | null | undefined,
): value is DevelopmentStatus {
	return isOneOf(DEVELOPMENT_STATUSES, value);
}

export interface McpAuditLog {
	id: string;
	createdAt: string;
	actor: string;
	toolName: string;
	sourceUrl?: string;
	status: "success" | "error";
	errorSummary?: string;
}

// Map visualization types
export interface JurisdictionStats {
	jurisdiction: Jurisdiction;
	policyCount: number;
	activePolicies: number;
	recentUpdates: number;
	agencies: number;
}

// Network/Graph visualization types
export interface PolicyNode {
	id: string;
	label: string;
	type: "policy" | "agency" | "jurisdiction";
	data: Policy | Agency | { jurisdiction: Jurisdiction };
}

export interface PolicyEdge {
	id: string;
	source: string;
	target: string;
	label?: string;
	type: "governs" | "related_to" | "supersedes" | "amends" | "located_in";
}

// API response types
export interface ApiResponse<T> {
	data: T | null;
	error: string | null;
	success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
}

// Filter types for UI
export interface PolicyFilters {
	jurisdiction?: Jurisdiction[];
	type?: PolicyType[];
	status?: PolicyStatus[];
	search?: string;
	dateFrom?: Date | string;
	dateTo?: Date | string;
	tags?: string[];
}

// Display name mappings
export const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
	federal: "Federal",
	nsw: "New South Wales",
	vic: "Victoria",
	qld: "Queensland",
	wa: "Western Australia",
	sa: "South Australia",
	tas: "Tasmania",
	act: "Australian Capital Territory",
	nt: "Northern Territory",
};

export const POLICY_TYPE_NAMES: Record<PolicyType, string> = {
	legislation: "Legislation",
	regulation: "Regulation",
	guideline: "Guideline",
	framework: "Framework",
	standard: "Standard",
	practice_note: "Practice Note",
	policy: "Policy",
	tool: "Tool",
	funding_program: "Funding Program",
};

function isOneOf<T extends readonly string[]>(
	values: T,
	value: string | null | undefined,
): value is T[number] {
	return (
		typeof value === "string" && (values as readonly string[]).includes(value)
	);
}

export function isJurisdiction(
	value: string | null | undefined,
): value is Jurisdiction {
	return isOneOf(JURISDICTIONS, value);
}

export function normalizeJurisdiction(
	value: string | null | undefined,
	fallback: Jurisdiction = "federal",
): Jurisdiction {
	return isJurisdiction(value) ? value : fallback;
}

export function isPolicyType(
	value: string | null | undefined,
): value is PolicyType {
	return isOneOf(POLICY_TYPES, value);
}

export function normalizePolicyType(
	value: string | null | undefined,
	fallback: PolicyType = "guideline",
): PolicyType {
	return isPolicyType(value) ? value : fallback;
}

export function isPolicyStatus(
	value: string | null | undefined,
): value is PolicyStatus {
	return isOneOf(POLICY_STATUSES, value);
}

export function normalizePolicyStatus(
	value: string | null | undefined,
	fallback: PolicyStatus = "active",
): PolicyStatus {
	return isPolicyStatus(value) ? value : fallback;
}

export function isTimelineEventType(
	value: string | null | undefined,
): value is TimelineEventType {
	return isOneOf(TIMELINE_EVENT_TYPES, value);
}

export function normalizeTimelineEventType(
	value: string | null | undefined,
	fallback: TimelineEventType = "announcement",
): TimelineEventType {
	return isTimelineEventType(value) ? value : fallback;
}

export function isSourceReviewStatus(
	value: string | null | undefined,
): value is SourceReviewStatus {
	return isOneOf(SOURCE_REVIEW_STATUSES, value);
}

export function isSourceReviewEntryKind(
	value: string | null | undefined,
): value is SourceReviewEntryKind {
	return isOneOf(SOURCE_REVIEW_ENTRY_KINDS, value);
}

export function getJurisdictionName(
	jurisdiction: string | null | undefined,
): string {
	if (!jurisdiction) return "Unknown";
	return isJurisdiction(jurisdiction)
		? JURISDICTION_NAMES[jurisdiction]
		: jurisdiction;
}

export function getPolicyTypeName(type: string | null | undefined): string {
	if (!type) return "Unknown";
	if (isPolicyType(type)) return POLICY_TYPE_NAMES[type];
	return type
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export const POLICY_STATUS_NAMES: Record<PolicyStatus, string> = {
	proposed: "Proposed",
	active: "Active",
	amended: "Amended",
	superseded: "Superseded",
	closed: "Closed",
	repealed: "Repealed",
	trashed: "Trashed",
};

export function getPolicyStatusName(status: string | null | undefined): string {
	if (!status) return "Unknown";
	return isPolicyStatus(status) ? POLICY_STATUS_NAMES[status] : status;
}

// AI Review Pipeline Types

export type PipelineStage =
	| "research"
	| "research_complete"
	| "verification"
	| "verification_complete"
	| "hitl_review"
	| "implementation"
	| "complete"
	| "failed";

export type FindingStatus =
	| "discovered"
	| "verified"
	| "rejected"
	| "implemented";

export type VerificationOutcome =
	| "confirmed"
	| "partially_confirmed"
	| "unverifiable"
	| "contradicted";

export interface ResearchFinding {
	id: string;
	pipelineRunId: string;
	title: string;
	summary: string;
	sourceUrl: string;
	sourceContent: string;
	discoveredAt: string;
	status: FindingStatus;
	relevanceScore: number;
	suggestedType: PolicyType | null;
	suggestedJurisdiction: Jurisdiction | null;
	tags: string[];
	agencies: string[];
	keyDates: string[];
	relatedTopics: string[];
	isNewPolicy: boolean;
	existingPolicyId?: string;
	changeDescription?: string;
}

export interface VerificationResult {
	id: string;
	findingId: string;
	pipelineRunId: string;
	verifiedAt: string;
	outcome: VerificationOutcome;
	confidenceScore: number;
	sourcesCrossReferenced: string[];
	verificationNotes: string;
	factualIssues: string[];
	suggestedCorrections: string[];
}

export interface ScraperRunLog {
	id: string;
	timestamp: string;
	sourceId: string;
	sourceName: string;
	linksFound: number;
	policiesCreated: number;
	errors: string[];
	durationMs: number;
}

export interface PipelineRun {
	id: string;
	startedAt: string;
	completedAt?: string;
	stage: PipelineStage;
	sourcesScanned: string[];
	findingsCount: number;
	verifiedCount: number;
	implementedCount: number;
	rejectedCount: number;
	hitlRequired: boolean;
	hitlApprovedAt?: string;
	hitlApprovedBy?: string;
	hitlNotes?: string;
	error?: string;
}

export const PIPELINE_STAGE_NAMES: Record<PipelineStage, string> = {
	research: "Researching",
	research_complete: "Research Complete",
	verification: "Verifying",
	verification_complete: "Verification Complete",
	hitl_review: "Awaiting Review",
	implementation: "Implementing",
	complete: "Complete",
	failed: "Failed",
};

export const VERIFICATION_OUTCOME_NAMES: Record<VerificationOutcome, string> = {
	confirmed: "Confirmed",
	partially_confirmed: "Partially Confirmed",
	unverifiable: "Unverifiable",
	contradicted: "Contradicted",
};
