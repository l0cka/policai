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

export const VERIFICATION_STATUSES = [
	"verified",
	"needs_review",
	"stale",
	"source_unavailable",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_METHODS = ["manual", "automated"] as const;

export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export interface LinkedDocumentEvidence {
	url: string;
	finalUrl?: string;
	retrievedAt?: string;
	contentType?: string;
	contentHash: string;
	etag?: string;
	lastModified?: string;
}

export const MANUAL_EXTRACTION_METHODS = [
	"ocr",
	"manual_transcription",
] as const;

export type ManualExtractionMethod =
	(typeof MANUAL_EXTRACTION_METHODS)[number];

export interface ManualExtractionEvidence {
	method: ManualExtractionMethod;
	extractedAt: string;
	extractedBy: string;
	notes: string;
	textHash: string;
	characterCount: number;
}

export interface ReviewedDateEvidence {
	date: string;
	precision: DatePrecision;
	reviewedAt: string;
	reviewedBy: string;
	notes: string;
}

/**
 * Provenance for an authenticated browser capture used when an official site
 * is readable in a real browser but blocks the hardened server-side retriever.
 * Local capture paths are deliberately never persisted.
 */
export interface BrowserCaptureEvidence {
	method: "browser";
	capturedAt: string;
	capturedBy: string;
	notes: string;
	pageContentHash: string;
	characterCount: number;
}

export interface SourceEvidence {
	url: string;
	finalUrl?: string;
	title?: string;
	publisher?: string;
	retrievedAt?: string;
	publishedAt?: string;
	publishedAtPrecision?: DatePrecision;
	contentType?: string;
	contentHash?: string;
	etag?: string;
	lastModified?: string;
	linkedDocuments?: LinkedDocumentEvidence[];
	browserCapture?: BrowserCaptureEvidence;
	manualExtraction?: ManualExtractionEvidence;
	/** Human confirmation for a record date not exposed as document metadata. */
	reviewedDate?: ReviewedDateEvidence;
}

export interface RecordVerification {
	status: VerificationStatus;
	source: SourceEvidence;
	checkedAt?: string;
	checkedBy?: string;
	method?: VerificationMethod;
	/** Latest automated fingerprint check; does not renew editorial review. */
	lastSourceAuditAt?: string;
	notes?: string;
}

export const TIMELINE_EVENT_TYPES = [
	"policy_introduced",
	"policy_amended",
	"policy_repealed",
	"policy_superseded",
	"announcement",
	"milestone",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type AgencyLevel = "federal" | "state";

export const POLICY_DATE_TYPES = [
	"published",
	"issued",
	"approved",
	"effective",
	"commenced",
	"amended",
	"consultation_opened",
	"consultation_closed",
	"superseded",
	"repealed",
] as const;

export type PolicyDateType = (typeof POLICY_DATE_TYPES)[number];

export const DATE_PRECISIONS = ["day", "month", "year"] as const;

export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export interface PolicyDate {
	type: PolicyDateType;
	date: Date | string;
	precision: DatePrecision;
	primary?: boolean;
	source?: SourceEvidence;
}

export interface Policy {
	id: string;
	title: string;
	description: string;
	jurisdiction: Jurisdiction;
	type: PolicyType;
	status: PolicyStatus;
	/**
	 * Compatibility alias for the primary structured date. New code should use
	 * `dates` and getPrimaryPolicyDate().
	 */
	effectiveDate: Date | string;
	dates: PolicyDate[];
	agencies: string[];
	sourceUrl: string;
	content: string;
	aiSummary: string;
	tags: string[];
	createdAt: Date | string;
	updatedAt: Date | string;
	verification: RecordVerification;
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
	hasPublishedStatement?: boolean;
	accountableOfficial?: string;
	contactEmail?: string;
	auditFindings?: string;
	verification: RecordVerification;
}

export interface TimelineEvent {
	id: string;
	date: Date | string;
	datePrecision?: DatePrecision;
	title: string;
	description: string;
	type: TimelineEventType;
	jurisdiction: Jurisdiction;
	relatedPolicyId?: string;
	sourceUrl: string;
	verification: RecordVerification;
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
	targetPolicyId?: string;
	/** Editorial revision from which an update review's draft was staged. */
	targetPolicyBaseRevisionHash?: string;
	/** Immutable collector transition order for mutable direct-document updates. */
	sourceVersionSequence?: number;
	/** Canonical policy revision captured when an update review was approved. */
	targetPolicyRevisionHash?: string;
	/** Stable id of the tracked timeline event being re-verified. */
	targetTimelineEventId?: string;
	/**
	 * Canonical timeline revision captured when staging an existing event or
	 * recovering a partial publication.
	 */
	targetTimelineRevisionHash?: string;
	status: SourceReviewStatus;
	discoveredAt: string;
	createdBy: string;
	notes?: string;
	analysis: SourceReviewAnalysis;
	sourceEvidence: SourceEvidence;
	proposedRecord: PolicyDraft | TimelineEventDraft;
	/** Stable collector output retained so partial multi-file writes can recover. */
	linkedDevelopment?: Development;
	reviewedAt?: string;
	reviewedBy?: string;
	approvalNotes?: string;
	publishedAt?: string;
	rejectionReason?: string;
	updatedAt: string;
}

export type PolicyDraft = Omit<
	Policy,
	"effectiveDate" | "dates" | "verification" | "lastReviewedAt"
> & {
	effectiveDate?: Date | string;
	dates?: PolicyDate[];
	verification?: RecordVerification;
	lastReviewedAt?: string;
};

export type TimelineEventDraft = Omit<TimelineEvent, "date" | "verification"> & {
	date?: Date | string;
	verification?: RecordVerification;
};

// Developments radar feed — automated detections from the collector.
// Distinct from the curated policy registry: safe to auto-publish because
// every entry carries provenance and a confidence label.

export const DEVELOPMENT_STATUSES = [
	"detected",
	"promoted",
	"dismissed",
] as const;

export type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number];

export interface ContentAssessment {
	method: "ai" | "heuristic" | "editorial";
	assessedAt: string;
	promptVersion: string;
	provider?: "anthropic" | "openrouter";
	model?: string;
}

export interface Development {
	id: string;
	title: string;
	url: string;
	sourceId: string;
	sourceName: string;
	jurisdiction: Jurisdiction;
	publishedAt?: string;
	publishedAtPrecision?: DatePrecision;
	detectedAt: string;
	summary?: string;
	relevanceScore: number;
	classification: "ai" | "heuristic" | "curated";
	assessment: ContentAssessment;
	verification: RecordVerification;
	status: DevelopmentStatus;
	relatedPolicyId?: string;
	relatedTimelineEventId?: string;
	dismissalReason?: string;
}

export const COLLECTION_HEALTH_STATUSES = [
	"healthy",
	"degraded",
	"failed",
] as const;

export type CollectionHealthStatus =
	(typeof COLLECTION_HEALTH_STATUSES)[number];

export const SOURCE_RUN_STATUSES = ["success", "error", "skipped"] as const;

export type SourceRunStatus = (typeof SOURCE_RUN_STATUSES)[number];

export interface SourceRunResult {
	sourceId: string;
	status: SourceRunStatus;
	/** False for candidate-only retries when the source index was not due. */
	coverageEligible?: boolean;
	checkedAt: string;
	durationMs: number;
	itemCount: number | null;
	candidateCount: number;
	newCandidateCount: number;
	error?: string;
}

export interface CollectionMeta {
	lastCollectedAt: string | null;
	lastHealthyAt: string | null;
	lastReviewedAt: string | null;
	collector: {
		runCount: number;
		lastRunSources: string[];
		lastRunErrors: string[];
		health: CollectionHealthStatus;
		dueSourceCount: number;
		successfulSourceCount: number;
		failedSourceCount: number;
		skippedSourceCount: number;
		successRate: number;
		automaticSourceCount: number;
		manualSourceCount: number;
		sourceResults: SourceRunResult[];
	};
}

export const MANUAL_SOURCE_REVIEW_STATUSES = [
	"checked",
	"source_unavailable",
] as const;

export type ManualSourceReviewStatus =
	(typeof MANUAL_SOURCE_REVIEW_STATUSES)[number];

export interface ManualSourceReview {
	sourceId: string;
	status: ManualSourceReviewStatus;
	reviewedAt: string;
	reviewedBy: string;
	evidence?: SourceEvidence;
	notes?: string;
}

export interface SourceMonitoringState {
	manualReviews: ManualSourceReview[];
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

export const POLICY_DATE_TYPE_NAMES: Record<PolicyDateType, string> = {
	published: "Published",
	issued: "Issued",
	approved: "Approved",
	effective: "Effective",
	commenced: "Commenced",
	amended: "Amended",
	consultation_opened: "Consultation opened",
	consultation_closed: "Consultation closed",
	superseded: "Superseded",
	repealed: "Repealed",
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

export function getPrimaryPolicyDate(
	policy: Pick<Policy, "dates" | "effectiveDate">,
): PolicyDate {
	return (
		policy.dates.find((date) => date.primary) ??
		policy.dates[0] ?? {
			type: "effective",
			date: policy.effectiveDate,
			precision: "day",
			primary: true,
		}
	);
}

export function getPolicyDateTypeName(type: PolicyDateType): string {
	return POLICY_DATE_TYPE_NAMES[type];
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
