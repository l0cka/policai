import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { analyseContentRelevance } from "@/lib/analysis";
import { isValidCalendarDate } from "@/lib/calendar-date";
import { withDataMutationLock } from "@/lib/data-lock";
import {
	extractRetrievedDocument,
	type ExtractedDocument,
} from "@/lib/pipeline/content";
import {
	documentKindFromBytes,
	retrieveSource,
	type RetrievedSource,
} from "@/lib/pipeline/fetch";
import { getSourceById } from "@/lib/pipeline/sources";
import {
	canonicalizeSourceEvidence,
	canonicalizeSourceUrl,
	isAllowedSourceHost,
	sourceIdentityUrls,
	sourceUrlsEqual,
} from "@/lib/source-url";
import {
	createPolicy,
	createSourceReview,
	createTimelineEvent,
	getDevelopments,
	getPolicies,
	getSourceReviewById,
	getSourceReviews,
	getTimelineEvents,
	logMcpAuditEvent,
	markCollectionReviewed,
	sourceUrlExists,
	upsertManualSourceReview,
	upsertDevelopment,
	updateDevelopment,
	updatePolicy,
	updateTimelineEvent,
	updateSourceReview,
} from "@/lib/data-service";
import { linkedDevelopmentId } from "@/lib/source-review";
import {
	policyRevisionHash,
	timelineRevisionHash,
} from "@/lib/policy-revision";
import { validatePolicies, validateTimeline } from "@/lib/validate-data";
import {
	isVerificationCurrent,
	VERIFICATION_CLOCK_SKEW_TOLERANCE_MS,
} from "@/lib/verification";
import {
	isSourceReviewStatus,
	normalizeJurisdiction,
	normalizePolicyType,
	type McpAuditLog,
	type DatePrecision,
	type ManualSourceReviewStatus,
	type Development,
	type Policy,
	type PolicyDraft,
	type SourceEvidence,
	type SourceReview,
	type SourceReviewEntryKind,
	type SourceReviewStatus,
	type TimelineEvent,
	type TimelineEventDraft,
} from "@/types";

export interface ManualExtractionInput {
	method: "ocr" | "manual_transcription";
	title: string;
	text: string;
	publishedAt?: string;
	publishedAtPrecision?: DatePrecision;
	notes: string;
}

export interface ReviewedDateInput {
	date: string;
	precision: DatePrecision;
	notes: string;
}

export interface BrowserCaptureInput {
	pageTitle: string;
	pageText: string;
	references: string[];
	stableMetadata?: Array<{ key: string; value: string }>;
	capturedAt: string;
	capturedBy: string;
	notes: string;
	linkedDocuments: Array<{
		url: string;
		filePath: string;
	}>;
}

const EDITORIAL_SOURCE_TIMEOUT_MS = 60_000;
const MAX_BROWSER_CAPTURE_CHARACTERS = 500_000;
const MAX_CAPTURED_DOCUMENT_BYTES = 32 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function retrieveEditorialSource(
	url: string,
	destinationPolicy?: "official" | "public-https",
): Promise<RetrievedSource> {
	return retrieveSource(url, {
		timeoutMs: EDITORIAL_SOURCE_TIMEOUT_MS,
		...(destinationPolicy ? { destinationPolicy } : {}),
	});
}

const STABLE_BROWSER_METADATA_KEYS = new Set([
	"article:published_time",
	"article:modified_time",
	"date",
	"datepublished",
	"dcterms.date",
	"dcterms.issued",
	"dcterms.modified",
	"dc.date",
	"og:title",
	"citation_title",
	"citation_publication_date",
]);

function capturePathIsWithin(root: string, filePath: string): boolean {
	const child = relative(root, filePath);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

async function readCapturedDocument(
	filePath: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
	if (!isAbsolute(filePath)) {
		throw new Error("Browser capture document paths must be absolute");
	}
	const original = await lstat(filePath);
	if (original.isSymbolicLink()) {
		throw new Error("Browser capture document paths cannot be symbolic links");
	}
	const resolvedPath = await realpath(filePath);
	const allowedRoots = await Promise.all(
		[resolve(tmpdir()), resolve("/tmp"), resolve(homedir(), "Downloads")].map(
			async (root) => realpath(root).catch(() => root),
		),
	);
	if (!allowedRoots.some((root) => capturePathIsWithin(root, resolvedPath))) {
		throw new Error(
			"Browser capture documents must be in the system temporary directory or the reviewer's Downloads directory",
		);
	}
	const details = await stat(resolvedPath);
	if (!details.isFile()) {
		throw new Error("Browser capture document path must identify a regular file");
	}
	if (details.size <= 0 || details.size > MAX_CAPTURED_DOCUMENT_BYTES) {
		throw new Error(
			`Browser capture document must be between 1 and ${MAX_CAPTURED_DOCUMENT_BYTES} bytes`,
		);
	}
	const bytes = await readFile(resolvedPath);
	const kind = documentKindFromBytes(bytes);
	if (!kind) {
		throw new Error(
			"Browser capture document must be a recognised PDF, Word, or RTF file",
		);
	}
	const contentType =
		kind === "pdf"
			? "application/pdf"
			: kind === "docx"
				? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
				: kind === "doc"
					? "application/msword"
					: "application/rtf";
	return { bytes, contentType };
}

function escapeCapturedHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

async function buildBrowserCapturedSource(
	sourceUrl: string,
	input: BrowserCaptureInput,
): Promise<RetrievedSource> {
	const canonicalUrl = canonicalizeSourceUrl(sourceUrl);
	if (!isAllowedSourceHost(canonicalUrl)) {
		throw new Error("Browser captures require an allow-listed official source URL");
	}
	const capturedAtMs = Date.parse(input.capturedAt);
	if (!Number.isFinite(capturedAtMs)) {
		throw new Error("Browser capture requires an RFC 3339 capturedAt timestamp");
	}
	const nowMs = Date.now();
	if (capturedAtMs > nowMs + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS) {
		throw new Error("Browser capture timestamp cannot be in the future");
	}
	if (capturedAtMs < nowMs - 24 * 60 * 60 * 1000) {
		throw new Error("Browser capture must have been collected within the last 24 hours");
	}
	const capturedBy = input.capturedBy.trim();
	const notes = input.notes.trim();
	const pageTitle = input.pageTitle.trim();
	const pageText = input.pageText.replace(/\s+/g, " ").trim();
	if (!capturedBy) throw new Error("Browser capture requires a human reviewer identity");
	if (notes.length < 20) {
		throw new Error("Browser capture requires substantive provenance notes");
	}
	if (!pageTitle) throw new Error("Browser capture requires the displayed page title");
	if (
		pageText.length < 20 ||
		pageText.length > MAX_BROWSER_CAPTURE_CHARACTERS
	) {
		throw new Error(
			`Browser capture page text must contain 20 to ${MAX_BROWSER_CAPTURE_CHARACTERS} characters`,
		);
	}
	if (input.linkedDocuments.length > 8) {
		throw new Error("Browser capture accepts at most 8 linked documents");
	}

	const references = Array.from(
		new Set(
			input.references.map((value) => {
				const canonical = canonicalizeSourceUrl(value);
				const parsed = new URL(canonical);
				if (
					parsed.protocol !== "https:" ||
					parsed.username ||
					parsed.password
				) {
					throw new Error("Browser capture references must be public HTTPS URLs");
				}
				return canonical;
			}),
		),
	).sort();
	const metadata = Array.from(
		new Set(
			(input.stableMetadata ?? []).map(({ key, value }) => {
				const normalizedKey = key.trim().toLowerCase();
				const normalizedValue = value.trim();
				if (
					!STABLE_BROWSER_METADATA_KEYS.has(normalizedKey) ||
					!normalizedValue
				) {
					throw new Error("Browser capture contains unsupported stable metadata");
				}
				return `${normalizedKey}:${normalizedValue}`;
			}),
		),
	).sort();
	const pageContentHash = createHash("sha256")
		.update(
			JSON.stringify({
				text: pageText,
				references: references.map((url) => `a:href:${url}`),
				metadata,
			}),
		)
		.digest("hex");
	if (!SHA256_PATTERN.test(pageContentHash)) {
		throw new Error("Browser capture did not produce a valid page fingerprint");
	}

	let capturedBytes = 0;
	const linkedSources: RetrievedSource[] = [];
	for (const linked of input.linkedDocuments) {
		const linkedUrl = canonicalizeSourceUrl(linked.url);
		if (!isAllowedSourceHost(linkedUrl)) {
			throw new Error(
				"Browser capture linked documents require allow-listed official URLs",
			);
		}
		if (!references.some((reference) => sourceUrlsEqual(reference, linkedUrl))) {
			throw new Error(
				"Every captured document URL must appear in the captured page references",
			);
		}
		const captured = await readCapturedDocument(linked.filePath);
		capturedBytes += captured.bytes.byteLength;
		if (capturedBytes > MAX_CAPTURED_DOCUMENT_BYTES) {
			throw new Error(
				`Browser capture documents exceed the ${MAX_CAPTURED_DOCUMENT_BYTES} byte aggregate limit`,
			);
		}
		linkedSources.push({
			body: "",
			bytes: captured.bytes,
			durationMs: 0,
			evidence: {
				url: linkedUrl,
				finalUrl: linkedUrl,
				retrievedAt: input.capturedAt,
				contentType: captured.contentType,
				contentHash: createHash("sha256")
					.update(captured.bytes)
					.digest("hex"),
			},
		});
	}
	linkedSources.sort((left, right) =>
		left.evidence.url.localeCompare(right.evidence.url),
	);
	const linkedDocuments = linkedSources.map(({ evidence }) => ({
		url: evidence.url,
		finalUrl: evidence.finalUrl,
		retrievedAt: evidence.retrievedAt,
		contentType: evidence.contentType,
		contentHash: evidence.contentHash ?? "",
	}));
	const contentHash = createHash("sha256")
		.update(
			JSON.stringify({
				pageHash: pageContentHash,
				linkedDocuments: linkedDocuments.map(({ url, contentHash }) => ({
					url,
					contentHash,
				})),
			}),
		)
		.digest("hex");
	const referenceMarkup = references
		.map(
			(reference) =>
				`<a href="${escapeCapturedHtml(reference)}">${escapeCapturedHtml(reference)}</a>`,
		)
		.join(" ");
	return {
		body: `<main><h1>${escapeCapturedHtml(pageTitle)}</h1><p>${escapeCapturedHtml(pageText)}</p>${referenceMarkup}</main>`,
		linkedSources,
		durationMs: 0,
		evidence: {
			url: canonicalUrl,
			finalUrl: canonicalUrl,
			title: pageTitle,
			retrievedAt: input.capturedAt,
			contentType: "text/html",
			contentHash,
			linkedDocuments,
			browserCapture: {
				method: "browser",
				capturedAt: input.capturedAt,
				capturedBy,
				notes,
				pageContentHash,
				characterCount: pageText.length,
			},
		},
	};
}

export interface SourceAnalysisResult {
	url: string;
	title: string;
	cleanContent: string;
	analysis: {
		isRelevant: boolean;
		relevanceScore: number;
		policyType?: string | null;
		jurisdiction?: string | null;
		summary: string;
		tags?: string[];
		agencies?: string[];
	};
	sourceEvidence: SourceEvidence;
	discoveredAt: string;
}

async function recordManualSourceReviewUnlocked(input: {
	sourceId: string;
	status: ManualSourceReviewStatus;
	actor: string;
	notes?: string;
	evidence?: Omit<SourceEvidence, "url">;
	reviewedAt?: string;
}): Promise<{
	sourceId: string;
	status: ManualSourceReviewStatus;
	reviewedAt: string;
	reviewedBy: string;
	evidence: SourceEvidence;
	notes?: string;
}> {
	const source = getSourceById(input.sourceId);
	if (!source || !source.enabled) {
		throw new Error("Unknown or disabled source");
	}
	if (source.automation !== "manual") {
		throw new Error("Source is configured for automatic collection");
	}
	const notes = input.notes?.trim();
	if (!notes || notes.length < 20) {
		throw new Error(
			"Manual source reviews require substantive inspection notes of at least 20 characters",
		);
	}
	const actor = input.actor.trim();
	if (!actor) {
		throw new Error("Manual source review requires a human reviewer identity");
	}
	if (input.evidence?.finalUrl) {
		validateSourceUrl(input.evidence.finalUrl);
	}
	if (
		input.evidence?.contentHash &&
		!/^[a-f0-9]{64}$/.test(input.evidence.contentHash)
	) {
		throw new Error("Manual source evidence contentHash must be SHA-256");
	}

	const reviewedAt = input.reviewedAt ?? new Date().toISOString();
	if (Number.isNaN(new Date(reviewedAt).getTime())) {
		throw new Error("Manual source review requires a valid reviewedAt timestamp");
	}
	if (
		new Date(reviewedAt).getTime() >
		Date.now() + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
	) {
		throw new Error("Manual source review cannot be future-dated");
	}
	if (
		input.evidence?.retrievedAt &&
		Number.isNaN(new Date(input.evidence.retrievedAt).getTime())
	) {
		throw new Error("Manual source evidence requires a valid retrievedAt timestamp");
	}
	if (
		input.evidence?.retrievedAt &&
		new Date(input.evidence.retrievedAt).getTime() >
			new Date(reviewedAt).getTime() +
				VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
	) {
		throw new Error("Manual source evidence cannot post-date its review");
	}
	if (
		input.evidence?.publishedAtPrecision &&
		!input.evidence.publishedAt
	) {
		throw new Error("Manual source evidence date precision requires a date");
	}
	if (
		input.evidence?.publishedAt &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(input.evidence.publishedAt) ||
			!isValidCalendarDate(input.evidence.publishedAt))
	) {
		throw new Error("Manual source evidence requires an exact calendar date");
	}
	const review = {
		sourceId: source.id,
		status: input.status,
		reviewedAt,
		reviewedBy: actor,
		evidence: canonicalizeSourceEvidence({
			url: source.url,
			...input.evidence,
		}),
		notes,
	};
	const monitoring = await upsertManualSourceReview(review);
	const stored = monitoring.manualReviews.find(
		(candidate) => candidate.sourceId === source.id,
	);
	if (!stored?.evidence) {
		throw new Error("Failed to retain manual source review evidence");
	}
	return { ...stored, evidence: stored.evidence };
}

export function recordManualSourceReview(
	input: Parameters<typeof recordManualSourceReviewUnlocked>[0],
): ReturnType<typeof recordManualSourceReviewUnlocked> {
	return withDataMutationLock(() =>
		recordManualSourceReviewUnlocked(input),
	);
}

export function validateSourceUrl(
	url: string,
	options: { stageOnly?: boolean } = {},
) {
	let parsed: URL;
	let canonicalUrl: string;
	try {
		canonicalUrl = canonicalizeSourceUrl(url);
		parsed = new URL(canonicalUrl);
	} catch {
		throw new Error("Invalid URL format");
	}

	if (parsed.protocol !== "https:") {
		throw new Error("Only HTTPS URLs are allowed");
	}

	const isOfficial = isAllowedSourceHost(canonicalUrl);
	if (!isOfficial && !options.stageOnly) {
		throw new Error(
			"Only allow-listed official URLs can be analysed or published directly",
		);
	}

	return { parsed, isOfficial, canonicalUrl };
}

function assertChronological(
	earlier: string | undefined,
	later: string,
	message: string,
): void {
	if (earlier && new Date(earlier).getTime() > new Date(later).getTime()) {
		throw new Error(message);
	}
}

function compareSourceReviewVersions(
	left: SourceReview,
	right: SourceReview,
): number {
	if (
		left.sourceVersionSequence !== undefined &&
		right.sourceVersionSequence !== undefined
	) {
		const sequenceDifference =
			left.sourceVersionSequence - right.sourceVersionSequence;
		if (sequenceDifference !== 0) return sequenceDifference;
	}
	const discoveredDifference =
		new Date(left.discoveredAt).getTime() -
		new Date(right.discoveredAt).getTime();
	return discoveredDifference || left.id.localeCompare(right.id);
}

function timelineReviewTargetId(review: SourceReview): string | undefined {
	if (review.targetTimelineEventId) return review.targetTimelineEventId;
	if (
		review.entryKind === "timeline_event" &&
		review.targetTimelineRevisionHash
	) {
		return (review.proposedRecord as TimelineEventDraft).id;
	}
	return undefined;
}

function sourceIdentityMatches(
	candidateUrls: string[],
	primaryUrl: string | undefined,
	evidence?: SourceEvidence,
): boolean {
	return candidateUrls.some((candidateUrl) =>
		sourceIdentityUrls(primaryUrl, evidence).some((existingUrl) =>
			sourceUrlsEqual(candidateUrl, existingUrl),
		),
	);
}

function sourceIdentityUrlsNotOwnedBy(
	candidateUrls: string[],
	primaryUrl: string | undefined,
	evidence?: SourceEvidence,
): string[] {
	const ownedUrls = sourceIdentityUrls(primaryUrl, evidence);
	return candidateUrls.filter(
		(candidateUrl) =>
			!ownedUrls.some((ownedUrl) => sourceUrlsEqual(candidateUrl, ownedUrl)),
	);
}

function calendarDateValue(value: Date | string): string {
	const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidCalendarDate(date)) {
		throw new Error("Record date must be an exact calendar date");
	}
	return date;
}

function bindSourceBackedDate(input: {
	sourceEvidence: SourceEvidence;
	recordDate: Date | string;
	precision: DatePrecision;
	actor: string;
	now: string;
	reviewedDate?: ReviewedDateInput;
	existingReviewedDate?: SourceEvidence["reviewedDate"];
	allowPublishedMetadata: boolean;
}): SourceEvidence {
	const recordDate = calendarDateValue(input.recordDate);
	if (
		input.allowPublishedMetadata &&
		input.sourceEvidence.publishedAt === recordDate &&
		input.sourceEvidence.publishedAtPrecision === input.precision
	) {
		return input.sourceEvidence;
	}

	if (input.reviewedDate) {
		const reviewedDate = calendarDateValue(input.reviewedDate.date);
		const notes = input.reviewedDate.notes.trim();
		if (
			reviewedDate !== recordDate ||
			input.reviewedDate.precision !== input.precision
		) {
			throw new Error(
				"Reviewed date evidence must exactly match the record date and precision",
			);
		}
		if (notes.length < 20) {
			throw new Error(
				"Reviewed date evidence requires substantive notes of at least 20 characters",
			);
		}
		return canonicalizeSourceEvidence({
			...input.sourceEvidence,
			reviewedDate: {
				date: reviewedDate,
				precision: input.precision,
				reviewedAt: input.now,
				reviewedBy: input.actor,
				notes,
			},
		});
	}

	const existing = input.existingReviewedDate;
	if (
		existing?.date === recordDate &&
		existing.precision === input.precision
	) {
		return canonicalizeSourceEvidence({
			...input.sourceEvidence,
			reviewedDate: existing,
		});
	}

	throw new Error(
		"Record date and precision must match extracted source metadata or include explicit reviewedDate evidence",
	);
}

async function analyseExtractedSource(
	retrieved: RetrievedSource,
	canonicalUrl: string,
	document: ExtractedDocument,
): Promise<SourceAnalysisResult> {
	const cleanContent = document.text;
	const analysis = await analyseContentRelevance(cleanContent, canonicalUrl);
	return {
		url: canonicalUrl,
		title: document.title,
		cleanContent,
		analysis,
		sourceEvidence: canonicalizeSourceEvidence({
			...retrieved.evidence,
			title: document.title,
			publishedAt: document.publishedAt,
			publishedAtPrecision: document.publishedAtPrecision,
		}),
		discoveredAt:
			retrieved.evidence.retrievedAt ?? new Date().toISOString(),
	};
}

export { policyRevisionHash };

export async function analyseSourceUrl(
	url: string,
	options: { stageOnly?: boolean } = {},
): Promise<SourceAnalysisResult> {
	const validation = validateSourceUrl(url, options);

	const canonicalUrl = validation.canonicalUrl;
	const retrieved = await retrieveEditorialSource(
		canonicalUrl,
		validation.isOfficial ? "official" : "public-https",
	);
	const document = await extractRetrievedDocument(
		retrieved,
		canonicalUrl,
		new URL(canonicalUrl).hostname,
	);
	return analyseExtractedSource(retrieved, canonicalUrl, document);
}

function slugify(value: string, maxLength = 60): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, maxLength);
}

export function buildProposedRecord(
	entryKind: SourceReviewEntryKind,
	analysisResult: SourceAnalysisResult,
): PolicyDraft | TimelineEventDraft {
	const now = new Date().toISOString();
	const baseId =
		slugify(analysisResult.title || new URL(analysisResult.url).hostname) ||
		randomUUID();
	const jurisdiction = normalizeJurisdiction(
		analysisResult.analysis.jurisdiction,
	);

	if (entryKind === "timeline_event") {
		return {
			id: `timeline-${baseId}`,
			date: analysisResult.sourceEvidence.publishedAt,
			datePrecision:
				analysisResult.sourceEvidence.publishedAtPrecision,
			title: analysisResult.title,
			description: analysisResult.analysis.summary,
			type: "announcement",
			jurisdiction,
			sourceUrl: analysisResult.url,
		};
	}

	return {
		id: baseId,
		title: analysisResult.title,
		description: analysisResult.analysis.summary,
		jurisdiction,
		type: normalizePolicyType(analysisResult.analysis.policyType),
		status: "active",
		effectiveDate: analysisResult.sourceEvidence.publishedAt,
		dates: analysisResult.sourceEvidence.publishedAt
			? [
					{
						type: "published",
						date: analysisResult.sourceEvidence.publishedAt,
						precision:
							analysisResult.sourceEvidence
								.publishedAtPrecision ?? "day",
						primary: true,
						source: analysisResult.sourceEvidence,
					},
				]
			: undefined,
		agencies: analysisResult.analysis.agencies || [],
		sourceUrl: analysisResult.url,
		content: analysisResult.cleanContent.slice(0, 4000),
		aiSummary: analysisResult.analysis.summary,
		tags: analysisResult.analysis.tags || [],
		createdAt: now,
		updatedAt: now,
	};
}

function buildReverificationDraft(policy: Policy, now: string): PolicyDraft {
	const draft: Partial<Policy> = { ...policy };
	delete draft.verification;
	delete draft.lastReviewedAt;
	return {
		...(draft as PolicyDraft),
		updatedAt: now,
	};
}

function buildTimelineReverificationDraft(
	event: TimelineEvent,
): TimelineEventDraft {
	const draft: Partial<TimelineEvent> = { ...event };
	delete draft.verification;
	return draft as TimelineEventDraft;
}

function withProspectiveTimelineEvent(
	events: TimelineEvent[],
	event: TimelineEvent,
): TimelineEvent[] {
	const existingIndex = events.findIndex(
		(existing) => existing.id === event.id,
	);
	if (existingIndex === -1) return [...events, event];
	return events.map((existing, index) =>
		index === existingIndex ? event : existing,
	);
}

async function stageSourceUrlUnlocked(input: {
	url: string;
	entryKind: SourceReviewEntryKind;
	targetRecordId?: string;
	proposedRecord?: PolicyDraft | TimelineEventDraft;
	replaceTargetSource?: boolean;
	notes?: string;
	actor: string;
	stageOnly?: boolean;
	browserCapture?: BrowserCaptureInput;
}): Promise<SourceReview> {
	const { canonicalUrl, isOfficial } = validateSourceUrl(input.url, {
		stageOnly: input.stageOnly,
	});
	const [trackedPolicies, trackedTimelineEvents] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
		getTimelineEvents(undefined, {
			includeGenerated: false,
			access: "admin",
		}),
	]);
	const sourceReviews = await getSourceReviews();
	const matchingPolicies = trackedPolicies.filter((policy) =>
		sourceUrlsEqual(policy.sourceUrl, canonicalUrl),
	);
	const matchingTimelineEvents = trackedTimelineEvents.filter((event) =>
		sourceUrlsEqual(event.sourceUrl, canonicalUrl),
	);
	const requestedMatches =
		input.entryKind === "policy"
			? matchingPolicies
			: matchingTimelineEvents;
	if (!input.targetRecordId && requestedMatches.length > 1) {
		throw new Error(
			`Multiple tracked ${input.entryKind === "policy" ? "policies" : "timeline events"} use this source URL; targetRecordId is required`,
		);
	}
	const targetPolicy =
		input.entryKind === "policy"
			? input.replaceTargetSource && input.targetRecordId
				? trackedPolicies.find((policy) => policy.id === input.targetRecordId)
				: matchingPolicies.find(
						(policy) =>
							!input.targetRecordId || policy.id === input.targetRecordId,
					)
			: undefined;
	const targetTimelineEvent =
		input.entryKind === "timeline_event"
			? matchingTimelineEvents.find(
					(event) =>
						!input.targetRecordId || event.id === input.targetRecordId,
				)
			: undefined;
	if (input.targetRecordId && !targetPolicy && !targetTimelineEvent) {
		throw new Error(
			`targetRecordId "${input.targetRecordId}" does not identify a tracked ${input.entryKind === "policy" ? "policy" : "timeline event"} with this source URL`,
		);
	}
	if (input.replaceTargetSource) {
		if (
			!input.browserCapture ||
			!input.proposedRecord ||
			!targetPolicy ||
			sourceUrlsEqual(targetPolicy.sourceUrl, canonicalUrl)
		) {
			throw new Error(
				"Replacing a tracked source requires a different official browser capture, the target policy id, and an explicit proposedRecord",
			);
		}
		if (
			input.proposedRecord.id !== targetPolicy.id ||
			!sourceUrlsEqual(input.proposedRecord.sourceUrl, canonicalUrl)
		) {
			throw new Error(
				"Source replacement proposedRecord must preserve the target policy id and use the captured source URL",
			);
		}
	}
	if (
		!targetPolicy &&
		!targetTimelineEvent &&
		(matchingPolicies.length > 0 || matchingTimelineEvents.length > 0)
	) {
		throw new Error(
			`Source URL belongs to tracked ${matchingPolicies.length > 0 ? "policy" : "timeline"} records; use the matching entryKind and targetRecordId`,
		);
	}
	let existingReview: SourceReview | undefined;
	if (targetPolicy) {
		existingReview = sourceReviews.find(
			(review) =>
				(review.status === "pending_review" || review.status === "approved") &&
				review.targetPolicyId === targetPolicy.id &&
				(input.replaceTargetSource ||
					sourceUrlsEqual(review.sourceUrl, canonicalUrl)),
		);
	} else if (targetTimelineEvent) {
		existingReview = sourceReviews.find(
			(review) =>
				(review.status === "pending_review" || review.status === "approved") &&
				timelineReviewTargetId(review) === targetTimelineEvent.id &&
				sourceUrlsEqual(review.sourceUrl, canonicalUrl),
		);
	} else {
		existingReview = sourceReviews.find(
			(review) =>
				(review.status === "pending_review" || review.status === "approved") &&
				review.entryKind === input.entryKind &&
				!review.targetPolicyId &&
				!timelineReviewTargetId(review) &&
				sourceUrlsEqual(review.sourceUrl, canonicalUrl),
		);
		if (!existingReview && (await sourceUrlExists(canonicalUrl))) {
			throw new Error("Source URL already exists in tracked or staged content");
		}
	}

	const linkedDevelopment = (
		await getDevelopments(undefined, { access: "admin" })
	).find(
		(development) =>
			sourceUrlsEqual(development.url, canonicalUrl) &&
			development.status === "detected",
	);
	if (
		input.browserCapture &&
		!targetPolicy &&
		!targetTimelineEvent &&
		!input.proposedRecord
	) {
		throw new Error(
			"New browser-captured sources require an explicitly reviewed proposedRecord",
		);
	}
	if (
		input.browserCapture &&
		input.proposedRecord &&
		!sourceUrlsEqual(input.proposedRecord.sourceUrl, canonicalUrl)
	) {
		throw new Error(
			"Browser-captured proposedRecord sourceUrl must match the captured source URL",
		);
	}
	let requiresManualExtraction = false;
	let analysisResult: SourceAnalysisResult;
	if (targetPolicy || targetTimelineEvent || input.browserCapture) {
		const retrieved = input.browserCapture
			? await buildBrowserCapturedSource(canonicalUrl, input.browserCapture)
			: await retrieveEditorialSource(
					canonicalUrl,
					isOfficial ? "official" : "public-https",
				);
		let document: ExtractedDocument | undefined;
		try {
			document = await extractRetrievedDocument(
				retrieved,
				canonicalUrl,
				new URL(canonicalUrl).hostname,
			);
		} catch {
			requiresManualExtraction = true;
		}
		if (document) {
			if (input.browserCapture) {
				const capturedRecord =
					targetPolicy ?? targetTimelineEvent ?? input.proposedRecord;
				if (!capturedRecord) {
					throw new Error("Browser-captured proposal disappeared during staging");
				}
				const capturedPolicy =
					input.entryKind === "policy"
						? (capturedRecord as PolicyDraft)
						: undefined;
				analysisResult = {
					url: canonicalUrl,
					title: document.title,
					cleanContent: document.text,
					analysis: {
						isRelevant: true,
						relevanceScore: 1,
						policyType: capturedPolicy?.type ?? null,
						jurisdiction: capturedRecord.jurisdiction,
						summary: capturedRecord.description,
						tags: capturedPolicy?.tags ?? [],
						agencies: capturedPolicy?.agencies ?? [],
					},
					sourceEvidence: canonicalizeSourceEvidence({
						...retrieved.evidence,
						title: document.title,
						publishedAt: document.publishedAt,
						publishedAtPrecision: document.publishedAtPrecision,
					}),
					discoveredAt:
						retrieved.evidence.retrievedAt ?? new Date().toISOString(),
				};
			} else {
				analysisResult = await analyseExtractedSource(
					retrieved,
					canonicalUrl,
					document,
				);
			}
		} else {
			const capturedRecord =
				targetPolicy ?? targetTimelineEvent ?? input.proposedRecord;
			if (!capturedRecord) {
				throw new Error("Browser-captured proposal disappeared during staging");
			}
			const capturedPolicy =
				input.entryKind === "policy"
					? (capturedRecord as PolicyDraft)
					: undefined;
			analysisResult = {
				url: canonicalUrl,
				title: capturedRecord.title,
				cleanContent: capturedPolicy?.content ?? capturedRecord.description,
				analysis: {
					isRelevant: true,
					relevanceScore: 1,
					policyType: capturedPolicy?.type ?? null,
					jurisdiction: capturedRecord.jurisdiction,
					summary: capturedRecord.description,
					tags: capturedPolicy?.tags ?? [],
					agencies: capturedPolicy?.agencies ?? [],
				},
				sourceEvidence: canonicalizeSourceEvidence(retrieved.evidence),
				discoveredAt:
					retrieved.evidence.retrievedAt ?? new Date().toISOString(),
				};
			}
		const targetRecord = targetPolicy ?? targetTimelineEvent;
		const candidateIdentityUrls = sourceIdentityUrls(
			canonicalUrl,
			analysisResult.sourceEvidence,
		);
		const collisionIdentityUrls = targetRecord
			? sourceIdentityUrlsNotOwnedBy(
					candidateIdentityUrls,
					targetRecord.sourceUrl,
					targetRecord.verification?.source,
				)
			: candidateIdentityUrls;
		const redirectCollision =
			trackedPolicies.some(
				(policy) =>
					policy.id !== targetPolicy?.id &&
					sourceIdentityMatches(
						collisionIdentityUrls,
						policy.sourceUrl,
						policy.verification.source,
					),
			) ||
			trackedTimelineEvents.some(
				(event) =>
					event.id !== targetTimelineEvent?.id &&
					sourceIdentityMatches(
						collisionIdentityUrls,
						event.sourceUrl,
						event.verification?.source,
					),
			) ||
			sourceReviews.some(
				(review) =>
					review.status !== "rejected" &&
					review.id !== existingReview?.id &&
					sourceIdentityMatches(
						collisionIdentityUrls,
						review.sourceUrl,
						review.sourceEvidence,
					),
			);
		if (redirectCollision) {
			throw new Error(
				targetRecord
					? "Tracked source redirected to an identity owned by another record or review"
					: "Browser-captured source identity is already owned by another record or review",
			);
		}
	} else {
		analysisResult = await analyseSourceUrl(canonicalUrl, {
			stageOnly: input.stageOnly,
		});
		const candidateUrls = sourceIdentityUrls(
			canonicalUrl,
			analysisResult.sourceEvidence,
		);
		if (!existingReview) {
			existingReview = sourceReviews.find(
				(review) =>
					(review.status === "pending_review" ||
						review.status === "approved") &&
					review.entryKind === input.entryKind &&
					!review.targetPolicyId &&
					!timelineReviewTargetId(review) &&
					sourceIdentityMatches(
						candidateUrls,
						review.sourceUrl,
						review.sourceEvidence,
					),
			);
		}
		const redirectCollision =
			trackedPolicies.some((policy) =>
				sourceIdentityMatches(
					candidateUrls,
					policy.sourceUrl,
					policy.verification.source,
				),
			) ||
			trackedTimelineEvents.some((event) =>
				sourceIdentityMatches(
					candidateUrls,
					event.sourceUrl,
					event.verification?.source,
				),
			) ||
			sourceReviews.some(
				(review) =>
					review.status !== "rejected" &&
					review.id !== existingReview?.id &&
					sourceIdentityMatches(
						candidateUrls,
						review.sourceUrl,
						review.sourceEvidence,
					),
			);
		if (redirectCollision) {
			throw new Error(
				"Requested or redirected source URL already exists in tracked or staged content",
			);
		}
	}
	const now = new Date().toISOString();
	const proposedRecord = input.proposedRecord ?? (targetPolicy
		? buildReverificationDraft(targetPolicy, now)
		: targetTimelineEvent
			? buildTimelineReverificationDraft(targetTimelineEvent)
			: buildProposedRecord(input.entryKind, analysisResult));

	const reviewProposal: Omit<SourceReview, "id"> = {
		sourceUrl: canonicalUrl,
		title:
			targetPolicy?.title ?? targetTimelineEvent?.title ?? analysisResult.title,
		entryKind: input.entryKind,
		...(targetPolicy
			? {
				targetPolicyId: targetPolicy.id,
				targetPolicyBaseRevisionHash: policyRevisionHash(targetPolicy),
				...(input.replaceTargetSource
					? { targetPolicyPreviousSourceUrl: targetPolicy.sourceUrl }
					: {}),
			}
			: {}),
		...(targetTimelineEvent
			? {
				targetTimelineEventId: targetTimelineEvent.id,
				targetTimelineRevisionHash:
					timelineRevisionHash(targetTimelineEvent),
			}
			: {}),
		status: "pending_review",
		discoveredAt: now,
		createdBy: existingReview?.createdBy ?? input.actor,
		notes:
			input.notes ??
			(requiresManualExtraction
				? "Automatic extraction was unavailable during staging; approval requires reviewed OCR or manual transcription evidence."
				: targetPolicy || targetTimelineEvent
					? "Existing tracked record staged for explicit editorial re-verification."
					: undefined),
		analysis: {
			isRelevant: analysisResult.analysis.isRelevant,
			relevanceScore: analysisResult.analysis.relevanceScore,
			suggestedType: analysisResult.analysis.policyType
				? normalizePolicyType(analysisResult.analysis.policyType)
				: null,
			suggestedJurisdiction: analysisResult.analysis.jurisdiction
				? normalizeJurisdiction(analysisResult.analysis.jurisdiction)
				: null,
			summary: analysisResult.analysis.summary,
			tags: analysisResult.analysis.tags,
			agencies: analysisResult.analysis.agencies,
		},
		sourceEvidence: analysisResult.sourceEvidence,
		proposedRecord,
		linkedDevelopment: linkedDevelopment ?? existingReview?.linkedDevelopment,
		updatedAt: now,
	};
	if (existingReview) {
		if (existingReview.sourceVersionSequence !== undefined) {
			const priorHash = existingReview.sourceEvidence.contentHash;
			const refreshedHash = reviewProposal.sourceEvidence.contentHash;
			if (!priorHash || !refreshedHash || priorHash !== refreshedHash) {
				throw new Error(
					"The source changed since the collector staged this ordered review; run collection again to create the next source transition",
				);
			}
		}
		const refreshed = await updateSourceReview(existingReview.id, {
			...reviewProposal,
			status: "pending_review",
			discoveredAt:
				existingReview.sourceVersionSequence !== undefined
					? existingReview.discoveredAt
					: reviewProposal.discoveredAt,
			sourceVersionSequence: existingReview.sourceVersionSequence,
			targetPolicyRevisionHash: undefined,
			targetTimelineRevisionHash:
				reviewProposal.targetTimelineRevisionHash,
			reviewedAt: undefined,
			reviewedBy: undefined,
			approvalNotes: undefined,
			publishedAt: undefined,
			rejectionReason: undefined,
		});
		if (!refreshed) {
			throw new Error("Failed to refresh the existing source review");
		}
		return refreshed;
	}
	return createSourceReview({
		id: `source-review-${randomUUID()}`,
		...reviewProposal,
	});
}

export function stageSourceUrl(
	input: Parameters<typeof stageSourceUrlUnlocked>[0],
): ReturnType<typeof stageSourceUrlUnlocked> {
	return withDataMutationLock(() => stageSourceUrlUnlocked(input));
}

export function stageSourceCapture(
	input: Omit<Parameters<typeof stageSourceUrlUnlocked>[0], "browserCapture"> & {
		browserCapture: BrowserCaptureInput;
	},
): ReturnType<typeof stageSourceUrlUnlocked> {
	return withDataMutationLock(() => stageSourceUrlUnlocked(input));
}

function rebaseLinkedDevelopment(
	review: SourceReview,
	sourceUrl: string,
	sourceEvidence: SourceEvidence,
	updates: Partial<Development>,
): Development | undefined {
	if (!review.linkedDevelopment) return undefined;
	return {
		...review.linkedDevelopment,
		...updates,
		url: sourceUrl,
		verification: {
			...review.linkedDevelopment.verification,
			source: sourceEvidence,
		},
	};
}

async function approveStagedSourceUnlocked(input: {
	id: string;
	actor: string;
	proposedRecord?: PolicyDraft | TimelineEventDraft;
	expectedTargetRevisionHash?: string;
	officialSourceUrl?: string;
	approvalNotes?: string;
	manualExtraction?: ManualExtractionInput;
	reviewedDate?: ReviewedDateInput;
	browserCapture?: BrowserCaptureInput;
}): Promise<SourceReview> {
	const review = await getSourceReviewById(input.id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	if (review.status === "published") {
		throw new Error("Published sources cannot be re-approved");
	}
	if (review.status === "rejected") {
		throw new Error("Rejected sources cannot be approved");
	}

	let sourceUrl = canonicalizeSourceUrl(review.sourceUrl);
	const storedSource = validateSourceUrl(review.sourceUrl, {
		stageOnly: true,
	});
	const approvalSourceUrl = canonicalizeSourceUrl(
		input.officialSourceUrl ?? review.sourceUrl,
	);
	const replacesSource = !sourceUrlsEqual(approvalSourceUrl, review.sourceUrl);
	const targetTimelineEventId = timelineReviewTargetId(review);
	if (replacesSource) {
		if (review.targetPolicyId || targetTimelineEventId) {
			throw new Error(
				"Tracked-record reviews cannot replace their canonical source URL",
			);
		}
		if (!input.proposedRecord) {
			throw new Error(
				"Source replacement requires an explicitly reviewed replacement proposedRecord",
			);
		}
	} else if (!storedSource.isOfficial) {
		throw new Error(
			"Stage-only reviews require an officialSourceUrl before approval",
		);
	}
	validateSourceUrl(approvalSourceUrl);
	const stagedWithBrowserCapture = Boolean(
		review.sourceEvidence.browserCapture,
	);
	if (stagedWithBrowserCapture !== Boolean(input.browserCapture)) {
		throw new Error(
			stagedWithBrowserCapture
				? "Browser-captured reviews require a fresh browser capture for approval"
				: "A browser capture changes the retrieval method and must be staged before approval",
		);
	}
	if (
		input.browserCapture &&
		input.browserCapture.capturedBy.trim() !== input.actor.trim()
	) {
		throw new Error(
			"The approving reviewer must be the named browser-capture reviewer",
		);
	}
	const retrieved = input.browserCapture
		? await buildBrowserCapturedSource(
				approvalSourceUrl,
				input.browserCapture,
			)
		: await retrieveEditorialSource(approvalSourceUrl);
	if (!replacesSource) {
		if (!review.sourceEvidence.contentHash) {
			throw new Error(
				"Staged source has no content fingerprint and must be re-staged before approval",
			);
		}
		if (
			review.sourceEvidence.contentHash !==
			retrieved.evidence.contentHash
		) {
			throw new Error(
				"Official source changed after staging and must be reviewed again before approval",
			);
		}
		const stagedDestination =
			review.sourceEvidence.finalUrl ?? review.sourceEvidence.url;
		const approvalDestination =
			retrieved.evidence.finalUrl ?? retrieved.evidence.url;
		if (!sourceUrlsEqual(stagedDestination, approvalDestination)) {
			throw new Error(
				"Official source redirect destination changed after staging and must be reviewed again before approval",
			);
		}
	}
	const now = new Date().toISOString();
	let manualExtractionEvidence: SourceEvidence["manualExtraction"];
	let document;
	try {
		document = await extractRetrievedDocument(
			retrieved,
			approvalSourceUrl,
			new URL(approvalSourceUrl).hostname,
		);
	} catch (error) {
		const manual = input.manualExtraction;
		if (!manual) throw error;
		if (!input.proposedRecord) {
			throw new Error(
				"Manual or OCR extraction requires an explicitly reviewed proposedRecord",
			);
		}
		const title = manual.title.trim();
		const text = manual.text.trim();
		const notes = manual.notes.trim();
		if (!title || text.length < 20 || !notes) {
			throw new Error(
				"Manual or OCR extraction requires a title, at least 20 characters of text, and explanatory notes",
			);
		}
		if (
			manual.publishedAtPrecision &&
			!manual.publishedAt
		) {
			throw new Error(
				"Manual extraction date precision requires a source-backed date",
			);
		}
		document = {
			title,
			text,
			publishedAt: manual.publishedAt,
			publishedAtPrecision: manual.publishedAtPrecision,
		};
		manualExtractionEvidence = {
			method: manual.method,
			extractedAt: now,
			extractedBy: input.actor,
			notes: `${notes} Automatic extraction failed: ${error instanceof Error ? error.message : String(error)}`,
			textHash: createHash("sha256").update(text).digest("hex"),
			characterCount: text.length,
		};
	}
	sourceUrl = approvalSourceUrl;
	let sourceEvidence: SourceEvidence = canonicalizeSourceEvidence({
		...retrieved.evidence,
		title: document.title,
		publishedAt: document.publishedAt,
		publishedAtPrecision: document.publishedAtPrecision,
		...(manualExtractionEvidence
			? { manualExtraction: manualExtractionEvidence }
			: {}),
	});
	const approvalSourceIdentityUrls = sourceIdentityUrls(
		sourceUrl,
		sourceEvidence,
	);

	assertChronological(
		review.discoveredAt,
		now,
		"Review cannot be approved before it was discovered",
	);
	assertChronological(
		sourceEvidence.retrievedAt,
		now,
		"Review cannot be approved before its source evidence was retrieved",
	);
	const proposedRecord = input.proposedRecord ?? review.proposedRecord;

	if (review.entryKind === "timeline_event") {
		if (review.targetPolicyId) {
			throw new Error("Timeline reviews cannot target an existing policy");
		}
		const draft = proposedRecord as TimelineEventDraft;
		if (!draft.date) {
			throw new Error(
				"Timeline event date is required and must come from the source",
			);
		}
		const datePrecision =
			draft.datePrecision ??
			(String(draft.date) === sourceEvidence.publishedAt
				? sourceEvidence.publishedAtPrecision
				: undefined);
		if (!datePrecision) {
			throw new Error(
				"Timeline event date precision is required and must come from the source",
			);
		}
		sourceEvidence = bindSourceBackedDate({
			sourceEvidence,
			recordDate: draft.date,
			precision: datePrecision,
			actor: input.actor,
			now,
			reviewedDate: input.reviewedDate,
			existingReviewedDate:
				review.status === "approved" &&
				review.sourceEvidence.contentHash === sourceEvidence.contentHash
					? review.sourceEvidence.reviewedDate
					: undefined,
			allowPublishedMetadata: true,
		});
		const event: TimelineEvent = {
			...draft,
			date: draft.date,
			datePrecision,
			sourceUrl,
			verification: {
				status: "verified",
				source: sourceEvidence,
				checkedAt: now,
				checkedBy: input.actor,
				method: "manual",
				notes: input.approvalNotes,
			},
		};
		if (
			targetTimelineEventId &&
			(event.id !== targetTimelineEventId ||
				!sourceUrlsEqual(event.sourceUrl, review.sourceUrl))
		) {
			throw new Error(
				"Timeline update review must preserve the target event id and source URL",
			);
		}
		const [policies, timelineEvents, sourceReviews] = await Promise.all([
			getPolicies(undefined, { access: "admin" }),
			getTimelineEvents(undefined, {
				includeGenerated: false,
				access: "admin",
			}),
			getSourceReviews(),
		]);
		const timelineCollision = timelineEvents.find(
			(existing) => existing.id === event.id,
		);
		let targetTimelineRevisionHash: string | undefined;
		if (targetTimelineEventId && !timelineCollision) {
			throw new Error("Target timeline event for update review was not found");
		}
		if (timelineCollision) {
			const previousApproved = review.proposedRecord as TimelineEvent;
			const currentTimelineRevisionHash =
				timelineRevisionHash(timelineCollision);
			const matchesTrackedTimeline =
				review.targetTimelineRevisionHash !== undefined &&
				currentTimelineRevisionHash === review.targetTimelineRevisionHash;
			const explicitlyRebasedTrackedTimeline =
				review.targetTimelineRevisionHash !== undefined &&
				input.proposedRecord !== undefined &&
				input.expectedTargetRevisionHash === currentTimelineRevisionHash;
			if (
				input.expectedTargetRevisionHash !== undefined &&
				input.expectedTargetRevisionHash !== currentTimelineRevisionHash
			) {
				throw new Error(
					"Expected target revision does not match the current timeline event; refresh the review before approval",
				);
			}
			const matchesPartialPublication =
				review.status === "approved" &&
				(wasPublishedFromReview(timelineCollision, previousApproved) ||
					(review.targetTimelineRevisionHash !== undefined &&
						currentTimelineRevisionHash ===
							review.targetTimelineRevisionHash));
			if (
				!matchesTrackedTimeline &&
				!explicitlyRebasedTrackedTimeline &&
				!matchesPartialPublication
			) {
				if (targetTimelineEventId) {
					throw new Error(
						"Target timeline event changed after this update was staged; approval requires an explicitly reviewed proposedRecord plus expectedTargetRevisionHash for the current event",
					);
				}
				throw new Error(
					`Timeline event id "${event.id}" is already used by an existing record`,
				);
			}
			targetTimelineRevisionHash = currentTimelineRevisionHash;
		}
			// Existing shared identities remain valid, but a re-verification cannot
			// adopt a new redirect destination owned by another tracked record.
			const collisionIdentityUrls = timelineCollision
				? sourceIdentityUrlsNotOwnedBy(
						approvalSourceIdentityUrls,
						timelineCollision.sourceUrl,
						timelineCollision.verification?.source,
					)
				: approvalSourceIdentityUrls;
			const timelineSourceUrlCollision = timelineEvents.find(
						(existing) =>
							existing.id !== event.id &&
							sourceIdentityMatches(
								collisionIdentityUrls,
								existing.sourceUrl,
								existing.verification?.source,
							),
					);
			const policySourceUrlCollision = policies.find((existing) =>
						sourceIdentityMatches(
					collisionIdentityUrls,
					existing.sourceUrl,
					existing.verification.source,
				),
				);
			const reviewSourceUrlCollision = sourceReviews.find(
						(existing) =>
							existing.id !== review.id &&
							existing.status !== "rejected" &&
							sourceIdentityMatches(
								collisionIdentityUrls,
								existing.sourceUrl,
								existing.sourceEvidence,
							),
				);
		if (
			timelineSourceUrlCollision ||
			policySourceUrlCollision ||
			reviewSourceUrlCollision
		) {
			throw new Error(
				`Source URL "${sourceUrl}" is already used by tracked or staged content`,
			);
		}
		const report = validateTimeline(
			withProspectiveTimelineEvent(timelineEvents, event),
			new Set(policies.map((policy) => policy.id)),
		);
		if (report.errors.length > 0) {
			throw new Error(
				`Timeline event is not publishable: ${report.errors.join("; ")}`,
			);
		}
		const linkedDevelopment = rebaseLinkedDevelopment(
			review,
			sourceUrl,
			sourceEvidence,
			{
				title: event.title,
				jurisdiction: event.jurisdiction,
				summary: event.description,
				publishedAt:
					event.date instanceof Date
						? event.date.toISOString().slice(0, 10)
						: event.date,
				publishedAtPrecision: event.datePrecision,
			},
		);
		const updated = await updateSourceReview(review.id, {
			sourceUrl,
			sourceEvidence,
			title: event.title,
			status: "approved",
			proposedRecord: event,
			...(targetTimelineEventId ? { targetTimelineEventId } : {}),
			...(targetTimelineRevisionHash
				? { targetTimelineRevisionHash }
				: {}),
			...(linkedDevelopment ? { linkedDevelopment } : {}),
			reviewedAt: now,
			reviewedBy: input.actor,
			approvalNotes: input.approvalNotes,
		});
		if (!updated) {
			throw new Error("Failed to approve staged source");
		}
		return updated;
	}

	const draft = proposedRecord as PolicyDraft;
	let targetPolicy: Policy | undefined;
	let replacesTargetPolicySource = false;
	const [policies, timelineEvents, sourceReviews] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
		getTimelineEvents(undefined, {
			includeGenerated: false,
			access: "admin",
		}),
		getSourceReviews(),
	]);
	if (review.targetPolicyId) {
		targetPolicy = policies.find(
			(policy) => policy.id === review.targetPolicyId,
		);
		if (!targetPolicy) {
			throw new Error("Target policy for update review was not found");
		}
		replacesTargetPolicySource = Boolean(
			review.targetPolicyPreviousSourceUrl &&
				sourceUrlsEqual(
					targetPolicy.sourceUrl,
					review.targetPolicyPreviousSourceUrl,
				) &&
				!sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl),
		);
		if (
			!sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl) &&
			!replacesTargetPolicySource
		) {
			throw new Error(
				"Update review source URL does not match the target policy",
			);
		}
		const currentTargetRevisionHash = policyRevisionHash(targetPolicy);
		if (
			input.expectedTargetRevisionHash !== undefined &&
			input.expectedTargetRevisionHash !== currentTargetRevisionHash
		) {
			throw new Error(
				"Expected target revision does not match the current policy; refresh the review before approval",
			);
		}
		if (
			review.targetPolicyBaseRevisionHash !== currentTargetRevisionHash &&
			(!input.proposedRecord ||
				input.expectedTargetRevisionHash !== currentTargetRevisionHash)
		) {
			throw new Error(
				"Target policy changed after this update was staged; approval requires an explicitly reviewed proposedRecord plus expectedTargetRevisionHash for the current policy",
				);
			}
		const newlyAdoptedIdentityUrls = sourceIdentityUrlsNotOwnedBy(
			approvalSourceIdentityUrls,
			targetPolicy.sourceUrl,
			targetPolicy.verification.source,
		);
		const redirectCollision =
			policies.some(
				(policy) =>
					policy.id !== targetPolicy?.id &&
					sourceIdentityMatches(
						newlyAdoptedIdentityUrls,
						policy.sourceUrl,
						policy.verification.source,
					),
			) ||
			timelineEvents.some((event) =>
				sourceIdentityMatches(
					newlyAdoptedIdentityUrls,
					event.sourceUrl,
					event.verification?.source,
				),
			) ||
			sourceReviews.some(
				(existing) =>
					existing.id !== review.id &&
					existing.status !== "rejected" &&
					sourceIdentityMatches(
						newlyAdoptedIdentityUrls,
						existing.sourceUrl,
						existing.sourceEvidence,
					),
			);
		if (redirectCollision) {
			throw new Error(
				`Source URL "${sourceUrl}" redirected to an identity owned by another tracked or staged record`,
			);
		}
	} else {
		const policySourceUrlCollision = policies.find(
			(policy) =>
				policy.id !== draft.id &&
				sourceIdentityMatches(
					approvalSourceIdentityUrls,
					policy.sourceUrl,
					policy.verification.source,
				),
		);
		const timelineSourceUrlCollision = timelineEvents.find(
			(event) =>
				sourceIdentityMatches(
					approvalSourceIdentityUrls,
					event.sourceUrl,
					event.verification?.source,
				),
		);
		const reviewSourceUrlCollision = sourceReviews.find(
			(existing) =>
				existing.id !== review.id &&
				existing.status !== "rejected" &&
				sourceIdentityMatches(
					approvalSourceIdentityUrls,
					existing.sourceUrl,
					existing.sourceEvidence,
				),
		);
		if (
			policySourceUrlCollision ||
			timelineSourceUrlCollision ||
			reviewSourceUrlCollision
		) {
			throw new Error(
				`Source URL "${sourceUrl}" is already used by tracked or staged content`,
			);
		}
		const collision = policies.find((policy) => policy.id === draft.id);
		if (collision) {
			const matchesPartialPublication =
				review.status === "approved" &&
				wasPublishedFromReview(
					collision,
					review.proposedRecord as Policy,
				);
			if (!matchesPartialPublication) {
				throw new Error(
					`Policy id "${draft.id}" is already used by an existing register record`,
				);
			}
			targetPolicy = collision;
		}
	}
	if (
		targetPolicy &&
		(draft.id !== targetPolicy.id ||
			(!sourceUrlsEqual(draft.sourceUrl, targetPolicy.sourceUrl) &&
				!replacesTargetPolicySource))
	) {
		throw new Error(
			"Update review must preserve the target policy id and source URL",
		);
	}
	const primaryDate = draft.dates?.find((date) => date.primary);
	if (!draft.dates?.length || !primaryDate) {
		throw new Error(
			"A labelled primary policy date is required and must be verified against the source",
		);
	}
	sourceEvidence = bindSourceBackedDate({
		sourceEvidence,
		recordDate: primaryDate.date,
		precision: primaryDate.precision,
		actor: input.actor,
		now,
		reviewedDate: input.reviewedDate,
		existingReviewedDate:
			review.status === "approved" &&
			review.sourceEvidence.contentHash === sourceEvidence.contentHash
				? review.sourceEvidence.reviewedDate
				: undefined,
		allowPublishedMetadata: primaryDate.type === "published",
	});
	const policy: Policy = {
		...draft,
		effectiveDate: primaryDate.date,
		dates: draft.dates.map((date) => ({
			...date,
			...(date.primary ? { source: sourceEvidence } : {}),
		})),
		sourceUrl,
		updatedAt: now,
		lastReviewedAt: now,
		verification: {
			status: "verified",
			source: sourceEvidence,
			checkedAt: now,
			checkedBy: input.actor,
			method: "manual",
			notes: input.approvalNotes,
		},
	};
	const report = validatePolicies([policy]);
	if (report.errors.length > 0) {
		throw new Error(`Policy is not publishable: ${report.errors.join("; ")}`);
	}

	const linkedDevelopment = rebaseLinkedDevelopment(
		review,
		sourceUrl,
		sourceEvidence,
		{
			title: policy.title,
			jurisdiction: policy.jurisdiction,
			summary: policy.description,
			publishedAt:
				primaryDate.date instanceof Date
					? primaryDate.date.toISOString().slice(0, 10)
					: primaryDate.date,
			publishedAtPrecision: primaryDate.precision,
		},
	);
	const updated = await updateSourceReview(review.id, {
		sourceUrl,
		sourceEvidence,
		title: policy.title,
		status: "approved",
		proposedRecord: policy,
		...(targetPolicy
			? {
					targetPolicyId: targetPolicy.id,
					targetPolicyBaseRevisionHash:
						policyRevisionHash(targetPolicy),
					targetPolicyRevisionHash: policyRevisionHash(targetPolicy),
				}
			: {}),
		...(linkedDevelopment ? { linkedDevelopment } : {}),
		reviewedAt: now,
		reviewedBy: input.actor,
		approvalNotes: input.approvalNotes,
	});
	if (!updated) {
		throw new Error("Failed to approve staged source");
	}
	return updated;
}

export function approveStagedSource(
	input: Parameters<typeof approveStagedSourceUnlocked>[0],
): ReturnType<typeof approveStagedSourceUnlocked> {
	return withDataMutationLock(() => approveStagedSourceUnlocked(input));
}

function publicationDetails(review: SourceReview): {
	verification: Policy["verification"];
	relatedPolicyId?: string;
	development: Partial<Development>;
} {
	if (review.entryKind === "timeline_event") {
		const event = review.proposedRecord as TimelineEvent;
		return {
			verification: event.verification,
			relatedPolicyId: event.relatedPolicyId,
			development: {
				title: event.title,
				url: event.sourceUrl,
				jurisdiction: event.jurisdiction,
				relatedTimelineEventId: event.id,
				publishedAt:
					event.date instanceof Date
						? event.date.toISOString().slice(0, 10)
						: event.date,
				publishedAtPrecision: event.datePrecision ?? "day",
				summary: event.description,
			},
		};
	}
	const policy = review.proposedRecord as Policy;
	const primaryDate = policy.dates.find((date) => date.primary);
	return {
		verification: policy.verification,
		relatedPolicyId: policy.id,
		development: {
			title: policy.title,
			url: policy.sourceUrl,
			jurisdiction: policy.jurisdiction,
			publishedAt:
				primaryDate?.date instanceof Date
					? primaryDate.date.toISOString().slice(0, 10)
					: primaryDate?.date,
			publishedAtPrecision: primaryDate?.precision,
			summary: policy.description,
		},
	};
}

async function reconcilePublicationSideEffects(
	review: SourceReview,
	publishedAt: string,
	options: { preserveExistingDevelopment?: boolean } = {},
): Promise<void> {
	const {
		verification,
		relatedPolicyId,
		development,
	} = publicationDetails(review);
	const assessedAt =
		review.reviewedAt ?? verification.checkedAt ?? publishedAt;
	await reconcileLinkedDevelopment(review, {
		...development,
		status: "promoted",
		verification,
		relatedPolicyId,
		relevanceScore: 1,
		classification: "curated",
		assessment: {
			method: "editorial",
			assessedAt,
			promptVersion: "editorial-review-v1",
		},
		dismissalReason: undefined,
	}, options);
	await markCollectionReviewed(review.reviewedAt ?? publishedAt);
}

async function reconcileLinkedDevelopment(
	review: SourceReview,
	updates: Partial<Development>,
	options: { preserveExistingDevelopment?: boolean } = {},
): Promise<void> {
	const developmentId = linkedDevelopmentId(review);
	if (!developmentId) return;
	if (options.preserveExistingDevelopment) {
		const developments = await getDevelopments(undefined, {
			access: "admin",
		});
		const existing = developments.find(
			(development) => development.id === developmentId,
		);
		if (existing) {
			// A detected row is the incomplete publication state and must be
			// promoted even when approval refreshed the retained evidence. Once a
			// row is terminal, preserve later editorial promotion/dismissal edits.
			if (existing.status !== "detected") {
				return;
			}
			const updated = await updateDevelopment(developmentId, updates);
			if (updated) return;
		}
	} else {
		const updated = await updateDevelopment(developmentId, updates);
		if (updated) return;
	}
	if (!review.linkedDevelopment) {
		throw new Error(
			`Matching development ${developmentId} is missing and cannot be reconstructed`,
		);
	}
	await upsertDevelopment({
		...review.linkedDevelopment,
		...updates,
	});
}

function wasPublishedFromReview(
	existing: Policy | TimelineEvent,
	proposed: Policy | TimelineEvent,
): boolean {
	const existingIsPolicy = "dates" in existing;
	const proposedIsPolicy = "dates" in proposed;
	if (existingIsPolicy !== proposedIsPolicy) return false;
	if (existingIsPolicy) {
		return (
			policyRevisionHash(existing as Policy) ===
			policyRevisionHash(proposed as Policy)
		);
	}
	return (
		timelineRevisionHash(existing as TimelineEvent) ===
		timelineRevisionHash(proposed as TimelineEvent)
	);
}

function policyWithLatestSourceAudit(
	approved: Policy,
	current: Policy,
): Policy {
	const approvedAudit = approved.verification.lastSourceAuditAt;
	const currentAudit = current.verification.lastSourceAuditAt;
	if (
		!currentAudit ||
		(approvedAudit &&
			new Date(approvedAudit).getTime() >=
				new Date(currentAudit).getTime())
	) {
		return approved;
	}
	return {
		...approved,
		verification: {
			...approved.verification,
			lastSourceAuditAt: currentAudit,
		},
	};
}

async function assertSourceStillMatchesApproval(
	review: SourceReview,
	approvedVerification: Policy["verification"],
	browserCapture?: BrowserCaptureInput,
): Promise<void> {
	const approvedHash = approvedVerification.source.contentHash;
	const approvedDestination =
		approvedVerification.source.finalUrl ?? approvedVerification.source.url;
	const retainedDestination =
		review.sourceEvidence.finalUrl ?? review.sourceEvidence.url;
	if (
		!approvedHash ||
		review.sourceEvidence.contentHash !== approvedHash ||
		!sourceUrlsEqual(retainedDestination, approvedDestination)
	) {
		throw new Error(
			"Approved source evidence is incomplete or inconsistent; re-approve the source before publication",
		);
	}
	const approvedWithBrowserCapture = Boolean(
		approvedVerification.source.browserCapture,
	);
	if (approvedWithBrowserCapture !== Boolean(browserCapture)) {
		throw new Error(
			approvedWithBrowserCapture
				? "Browser-captured sources require a fresh browser capture before publication"
				: "A browser capture changes the retrieval method and requires a new staged review",
		);
	}
	const retrieved = browserCapture
		? await buildBrowserCapturedSource(review.sourceUrl, browserCapture)
		: await retrieveEditorialSource(review.sourceUrl);
	if (retrieved.evidence.contentHash !== approvedHash) {
		throw new Error(
			"Official source changed after approval; re-approve it before publication",
		);
	}
	const currentDestination =
		retrieved.evidence.finalUrl ?? retrieved.evidence.url;
	if (!sourceUrlsEqual(currentDestination, approvedDestination)) {
		throw new Error(
			"Official source redirect destination changed after approval; re-approve it before publication",
		);
	}
}

async function assertTargetSourceIdentityIsUncontested(
	review: SourceReview,
	approvedVerification: Policy["verification"],
): Promise<void> {
	const targetTimelineEventId = timelineReviewTargetId(review);
	if (!review.targetPolicyId && !targetTimelineEventId) return;

	const [policies, timelineEvents, sourceReviews] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
		getTimelineEvents(undefined, {
			includeGenerated: false,
			access: "admin",
		}),
		getSourceReviews(),
	]);
	const target = review.targetPolicyId
		? policies.find((policy) => policy.id === review.targetPolicyId)
		: timelineEvents.find((event) => event.id === targetTimelineEventId);
	if (!target) {
		throw new Error("Target record for update review was not found");
	}
	const newlyAdoptedIdentityUrls = sourceIdentityUrlsNotOwnedBy(
		sourceIdentityUrls(review.sourceUrl, approvedVerification.source),
		target.sourceUrl,
		target.verification?.source,
	);
	const collision =
		policies.some(
			(policy) =>
				policy.id !== review.targetPolicyId &&
				sourceIdentityMatches(
					newlyAdoptedIdentityUrls,
					policy.sourceUrl,
					policy.verification.source,
				),
		) ||
		timelineEvents.some(
			(event) =>
				event.id !== targetTimelineEventId &&
				sourceIdentityMatches(
					newlyAdoptedIdentityUrls,
					event.sourceUrl,
					event.verification?.source,
				),
		) ||
		sourceReviews.some(
			(candidate) =>
				candidate.id !== review.id &&
				candidate.status !== "rejected" &&
				sourceIdentityMatches(
					newlyAdoptedIdentityUrls,
					candidate.sourceUrl,
					candidate.sourceEvidence,
				),
		);
	if (collision) {
		throw new Error(
			"Approved source identity is now owned by another tracked or staged record; re-stage the target source",
		);
	}
}

async function canonicalRecordWrittenFromReview(
	review: SourceReview,
): Promise<Policy | TimelineEvent | null> {
	if (review.entryKind === "timeline_event") {
		const proposed = review.proposedRecord as TimelineEvent;
		const events = await getTimelineEvents(undefined, {
			includeGenerated: false,
			access: "admin",
		});
		const existing = events.find(
			(event) =>
				event.id === proposed.id ||
				sourceUrlsEqual(event.sourceUrl, proposed.sourceUrl),
		);
		return existing && wasPublishedFromReview(existing, proposed)
			? existing
			: null;
	}

	const proposed = review.proposedRecord as Policy;
	const policies = await getPolicies(undefined, { access: "admin" });
	const existing = policies.find(
		(policy) =>
			policy.id === proposed.id ||
			sourceUrlsEqual(policy.sourceUrl, proposed.sourceUrl),
	);
	return existing && wasPublishedFromReview(existing, proposed)
		? existing
		: null;
}

export function publishStagedSource(
	id: string,
	options: { browserCapture?: BrowserCaptureInput } = {},
): Promise<SourceReview> {
	return withDataMutationLock(() =>
		publishStagedSourceUnlocked(id, options),
	);
}

async function publishStagedSourceUnlocked(
	id: string,
	options: { browserCapture?: BrowserCaptureInput } = {},
): Promise<SourceReview> {
	const review = await getSourceReviewById(id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	if (review.status === "published") {
		await reconcilePublicationSideEffects(
			review,
			review.publishedAt ?? review.reviewedAt ?? new Date().toISOString(),
			{ preserveExistingDevelopment: true },
		);
		return review;
	}
	if (review.status === "rejected") {
		throw new Error("Rejected sources cannot be published");
	}
	if (review.status !== "approved") {
		throw new Error("Source must be explicitly approved before publishing");
	}
	validateSourceUrl(review.sourceUrl);
	const canonicalRecord = await canonicalRecordWrittenFromReview(review);
	const approvedVerification =
		review.entryKind === "timeline_event"
			? (review.proposedRecord as TimelineEvent).verification
			: (review.proposedRecord as Policy).verification;
	if (!isVerificationCurrent(approvedVerification)) {
		throw new Error(
			"Approved verification has expired; re-approve the source before publication",
		);
	}

	let relatedUpdateReviews: SourceReview[] = [];
	if (review.targetPolicyId) {
		relatedUpdateReviews = (await getSourceReviews()).filter(
			(candidate) =>
				candidate.id !== review.id &&
				candidate.targetPolicyId === review.targetPolicyId &&
				candidate.status !== "rejected",
		);
		const newerReview = relatedUpdateReviews.find(
			(candidate) =>
				compareSourceReviewVersions(candidate, review) > 0,
		);
		if (newerReview) {
			throw new Error(
				`A newer source update review exists (${newerReview.id}); older revisions cannot be published`,
			);
		}
	}
	await assertTargetSourceIdentityIsUncontested(review, approvedVerification);
	await assertSourceStillMatchesApproval(
		review,
		approvedVerification,
		options.browserCapture,
	);

	const publishedAt = new Date().toISOString();
	let reviewForPublication = canonicalRecord
		? { ...review, proposedRecord: canonicalRecord }
		: review;
	assertChronological(
		review.reviewedAt,
		publishedAt,
		"Review cannot be published before it was approved",
	);

	if (review.entryKind === "timeline_event") {
		if (review.targetPolicyId) {
			throw new Error("Timeline reviews cannot target an existing policy");
		}
		const event = review.proposedRecord as TimelineEvent;
		const targetTimelineEventId = timelineReviewTargetId(review);
		if (
			targetTimelineEventId &&
			(event.id !== targetTimelineEventId ||
				!sourceUrlsEqual(event.sourceUrl, review.sourceUrl))
		) {
			throw new Error(
				"Timeline update review must preserve the target event id and source URL",
			);
		}
		const [policies, timelineEvents] = await Promise.all([
			getPolicies(undefined, { access: "admin" }),
			getTimelineEvents(undefined, {
				includeGenerated: false,
				access: "admin",
			}),
		]);
		const report = validateTimeline(
			withProspectiveTimelineEvent(timelineEvents, event),
			new Set(policies.map((policy) => policy.id)),
		);
		if (report.errors.length > 0) {
			throw new Error(
				`Timeline event is not publishable: ${report.errors.join("; ")}`,
			);
		}
		const existingEvent = targetTimelineEventId
			? timelineEvents.find(
					(candidate) => candidate.id === targetTimelineEventId,
				)
			: timelineEvents.find(
					(candidate) =>
						candidate.id === event.id ||
						sourceUrlsEqual(candidate.sourceUrl, event.sourceUrl),
				);
		if (targetTimelineEventId && !existingEvent) {
			throw new Error("Target timeline event for update review was not found");
		}
		if (existingEvent) {
			if (
				targetTimelineEventId &&
				!sourceUrlsEqual(existingEvent.sourceUrl, review.sourceUrl)
			) {
				throw new Error(
					"Timeline update review source URL does not match the target event",
				);
			}
			if (!wasPublishedFromReview(existingEvent, event)) {
				if (
					!review.targetTimelineRevisionHash ||
					timelineRevisionHash(existingEvent) !==
						review.targetTimelineRevisionHash
				) {
					throw new Error("Source URL already exists in tracked content");
				}
				const updatedEvent = await updateTimelineEvent(event.id, event);
				if (!updatedEvent) {
					throw new Error("Failed to update partially published timeline event");
				}
			}
		} else {
			const duplicateExists = await sourceUrlExists(review.sourceUrl, {
				excludeSourceReviewId: review.id,
			});
			if (duplicateExists) {
				throw new Error("Source URL already exists in tracked content");
			}
			await createTimelineEvent(event, {
				excludeSourceReviewId: review.id,
			});
		}
	} else {
		const policy = review.proposedRecord as Policy;
		const report = validatePolicies([policy]);
		if (report.errors.length > 0) {
			throw new Error(`Policy is not publishable: ${report.errors.join("; ")}`);
		}
		if (review.targetPolicyId) {
			if (
				policy.id !== review.targetPolicyId ||
				!sourceUrlsEqual(policy.sourceUrl, review.sourceUrl)
			) {
				throw new Error(
					"Update review must preserve the target policy id and source URL",
				);
			}
			const existingPolicies = await getPolicies(undefined, {
				access: "admin",
			});
			const targetPolicy = existingPolicies.find(
				(existing) => existing.id === review.targetPolicyId,
			);
			if (!targetPolicy) {
				throw new Error("Target policy for update review was not found");
			}
			const replacesTargetSource = Boolean(
				review.targetPolicyPreviousSourceUrl &&
					sourceUrlsEqual(
						targetPolicy.sourceUrl,
						review.targetPolicyPreviousSourceUrl,
					) &&
					!sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl),
			);
			if (
				!sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl) &&
				!replacesTargetSource
			) {
				throw new Error(
					"Update review source URL does not match the target policy",
				);
			}
			const targetMatchesApproved = wasPublishedFromReview(
				targetPolicy,
				policy,
			);
			if (!targetMatchesApproved) {
				if (!review.targetPolicyRevisionHash) {
					throw new Error(
						"Update review has no target revision and must be re-approved before publication",
					);
				}
				if (
					policyRevisionHash(targetPolicy) !==
					review.targetPolicyRevisionHash
				) {
					throw new Error(
						"Target policy changed after approval; rebase and re-approve the update review",
					);
				}
			}
			const policyToPublish = policyWithLatestSourceAudit(
				policy,
				targetPolicy,
			);
			reviewForPublication = {
				...review,
				proposedRecord: policyToPublish,
			};
			if (!targetMatchesApproved) {
				const updatedPolicy = await updatePolicy(
					review.targetPolicyId,
					policyToPublish,
				);
				if (!updatedPolicy) {
					throw new Error("Failed to update target policy");
				}
			}
			for (const olderReview of relatedUpdateReviews) {
				if (
					(olderReview.status === "pending_review" ||
						olderReview.status === "approved") &&
					compareSourceReviewVersions(olderReview, review) < 0
				) {
					await reconcileLinkedDevelopment(olderReview, {
						status: "dismissed",
						dismissalReason: `Superseded by newer source update ${review.id}`,
					});
					await updateSourceReview(olderReview.id, {
						status: "rejected",
						rejectionReason: `Superseded by newer source update ${review.id}`,
					});
				}
			}
		} else {
			const existingPolicies = await getPolicies(undefined, {
				access: "admin",
			});
			const existingPolicy = existingPolicies.find(
				(candidate) =>
					candidate.id === policy.id ||
					sourceUrlsEqual(candidate.sourceUrl, policy.sourceUrl),
			);
			if (existingPolicy) {
				if (!wasPublishedFromReview(existingPolicy, policy)) {
					throw new Error("Source URL already exists in tracked content");
				}
			} else {
				const duplicateExists = await sourceUrlExists(review.sourceUrl, {
					excludeSourceReviewId: review.id,
				});
				if (duplicateExists) {
					throw new Error("Source URL already exists in tracked content");
				}
				await createPolicy(policy);
			}
		}
	}

	const updated = await updateSourceReview(review.id, {
		status: "published",
		publishedAt,
		proposedRecord: reviewForPublication.proposedRecord,
	});
	if (!updated) {
		throw new Error("Failed to update staged source after publishing");
	}
	// The review is the public transaction boundary. Development promotion and
	// collection metadata are recoverable side effects, so they must not become
	// publicly verified before this terminal status is durable.
	await reconcilePublicationSideEffects(reviewForPublication, publishedAt);
	return updated;
}

async function rejectStagedSourceUnlocked(
	id: string,
	reason?: string,
): Promise<SourceReview> {
	const review = await getSourceReviewById(id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	if (review.status === "published") {
		throw new Error("Published sources cannot be rejected");
	}
	if (
		review.targetPolicyId ||
		review.targetTimelineEventId ||
		review.targetTimelineRevisionHash
	) {
		throw new Error(
			"Tracked-record reviews must be approved and published to re-verify the target; they cannot be rejected",
		);
	}
	if (review.status === "rejected") {
		await reconcileLinkedDevelopment(review, {
			status: "dismissed",
			dismissalReason:
				review.rejectionReason || reason || "Rejected during editorial review",
		});
		return review;
	}
	// Hide the public lead before making rejection terminal. If dismissal fails,
	// the review remains retryable instead of leaving rejected material visible.
	await reconcileLinkedDevelopment(review, {
		status: "dismissed",
		dismissalReason: reason || "Rejected during editorial review",
	});
	const updated = await updateSourceReview(id, {
		status: "rejected",
		rejectionReason: reason,
	});
	if (!updated) {
		throw new Error("Staged source not found");
	}
	return updated;
}

export function rejectStagedSource(
	id: string,
	reason?: string,
): ReturnType<typeof rejectStagedSourceUnlocked> {
	return withDataMutationLock(() =>
		rejectStagedSourceUnlocked(id, reason),
	);
}

export async function checkCoverage(input: {
	query?: string;
	sourceUrl?: string;
}) {
	const query = input.query?.toLowerCase().trim();
	const sourceUrl = input.sourceUrl?.trim();
	const [policies, timelineEvents, sourceReviews] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
		getTimelineEvents(undefined, {
			includeGenerated: false,
			access: "admin",
		}),
		getSourceReviews(),
	]);

	return {
		policies: policies.filter(
			(policy) =>
				(sourceUrl && sourceUrlsEqual(policy.sourceUrl, sourceUrl)) ||
				(query &&
					[
						policy.title,
						policy.description,
						policy.aiSummary,
						policy.sourceUrl,
						...policy.tags,
						...policy.agencies,
					].some((value) => value.toLowerCase().includes(query))),
		),
		timelineEvents: timelineEvents.filter(
			(event) =>
				(sourceUrl && sourceUrlsEqual(event.sourceUrl, sourceUrl)) ||
				(query &&
					[event.title, event.description, event.sourceUrl || ""].some(
						(value) => value.toLowerCase().includes(query),
					)),
		),
		stagedSources: sourceReviews.filter(
			(review) =>
				(sourceUrl && sourceUrlsEqual(review.sourceUrl, sourceUrl)) ||
				(query &&
					[
						review.title,
						review.sourceUrl,
						review.analysis.summary,
						...(review.analysis.tags || []),
						...(review.analysis.agencies || []),
					].some((value) => value.toLowerCase().includes(query))),
		),
	};
}

export async function auditMcpTool(
	input: Omit<McpAuditLog, "id" | "createdAt">,
): Promise<void> {
	await logMcpAuditEvent({
		id: `mcp-audit-${randomUUID()}`,
		createdAt: new Date().toISOString(),
		...input,
	});
}

export function normalizeReviewStatus(
	status?: string,
): SourceReviewStatus | undefined {
	if (!status) return undefined;
	if (isSourceReviewStatus(status)) {
		return status;
	}
	throw new Error("Invalid source review status");
}
