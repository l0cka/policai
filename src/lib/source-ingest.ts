import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { analyseContentRelevance } from "@/lib/analysis";
import { isValidCalendarDate } from "@/lib/calendar-date";
import { withDataMutationLock } from "@/lib/data-lock";
import { isLegislativeDraft } from "@/lib/legislation/model";
import {
	extractRetrievedDocument,
	type ExtractedDocument,
} from "@/lib/pipeline/content";
import { FINGERPRINT_METADATA_KEYS } from "@/lib/pipeline/date-metadata";
import {
	documentKindFromBytes,
	matchesRetrievedContent,
	retrieveSource,
	type RetrievedSource,
} from "@/lib/pipeline/fetch";
import { classifyFailure } from "@/lib/pipeline/failure";
import { getSourceById } from "@/lib/pipeline/sources";
import {
	canonicalizeSourceEvidence,
	canonicalizeSourceUrl,
	isAllowedSourceHost,
	parseSourceUrl,
	sourceIdentityUrls,
	sourceUrlsEqual,
} from "@/lib/source-url";
import {
	createPolicy,
	createSourceReview,
	createTimelineEvent,
	getDevelopments,
	getPolicies,
	getPolicyById,
	getSourceReviewById,
	getSourceReviews,
	getTimelineEvents,
	logMcpAuditEvent,
	markCollectionReviewed,
	retireTimelineEventsCiting,
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
	revisionHash,
	timelineRevisionHash,
} from "@/lib/policy-revision";
import {
	dateEvidenceMatches,
	mergeReports,
	validatePolicies,
	validatePolicyThemes,
	validateTimeline,
} from "@/lib/validate-data";
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
	type SourceReviewDecision,
	type SourceReviewEntryKind,
	type SourceReviewProposal,
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
	requestedBy?: string;
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
/** How old a staged browser capture may be when the editor decides on it. */
export const STAGED_CAPTURE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Appended to approval notes when live re-fetch is refused and the staged snapshot is used. */
export const RETAINED_SNAPSHOT_APPROVAL_NOTE =
	"Approval used the collector-retained source snapshot because the live re-fetch was refused by the host (HTTP 403, 429, or equivalent identity/rate refusal).";

function retrieveEditorialSource(
	url: string,
	destinationPolicy?: "official" | "public-https",
): Promise<RetrievedSource> {
	return retrieveSource(url, {
		timeoutMs: EDITORIAL_SOURCE_TIMEOUT_MS,
		...(destinationPolicy ? { destinationPolicy } : {}),
	});
}

function isHostRefusalForApprovalFallback(error: unknown): boolean {
	const { cls } = classifyFailure(error);
	return cls === "identity_refused" || cls === "rate_limited";
}

function retainedSnapshotBody(review: SourceReview): string | null {
	const proposed = review.proposedRecord;
	if ("content" in proposed && typeof proposed.content === "string") {
		const content = proposed.content.trim();
		if (content.length >= 20) return content;
	}
	const description = proposed.description?.trim();
	if (description && description.length >= 20) return description;
	return null;
}

/**
 * Rebuild a RetrievedSource from the staged review when the host refuses a
 * live re-fetch. Uses only retained evidence + proposed text — no invented bytes.
 */
function buildRetainedApprovalSnapshot(
	review: SourceReview,
	approvalSourceUrl: string,
): RetrievedSource | null {
	const evidence = review.sourceEvidence;
	if (!evidence.contentHash || !evidence.retrievedAt) return null;
	const stagedDestination = evidence.finalUrl ?? evidence.url;
	if (
		!sourceUrlsEqual(approvalSourceUrl, evidence.url) &&
		!sourceUrlsEqual(approvalSourceUrl, stagedDestination)
	) {
		return null;
	}
	const body = retainedSnapshotBody(review);
	if (!body) return null;
	return {
		body,
		durationMs: 0,
		evidence: canonicalizeSourceEvidence(evidence),
	};
}

function withRetainedSnapshotApprovalNotes(
	approvalNotes: string | undefined,
	usedRetainedSnapshot: boolean,
): string | undefined {
	if (!usedRetainedSnapshot) return approvalNotes;
	if (!approvalNotes?.trim()) return RETAINED_SNAPSHOT_APPROVAL_NOTE;
	if (approvalNotes.includes(RETAINED_SNAPSHOT_APPROVAL_NOTE)) {
		return approvalNotes;
	}
	return `${approvalNotes.trim()}\n${RETAINED_SNAPSHOT_APPROVAL_NOTE}`;
}

type ApprovalSnapshot = "collector" | "staged_capture";

/**
 * A browser-captured review keeps only fingerprints of the page, so the
 * decision reuses that staged evidence while it is recent enough.
 */
function stagedCaptureSnapshot(
	review: SourceReview,
	approvalSourceUrl: string,
): RetrievedSource {
	const capture = review.sourceEvidence.browserCapture;
	if (!capture) {
		throw new Error("Review has no staged browser capture to reuse");
	}
	if (Date.now() - Date.parse(capture.capturedAt) > STAGED_CAPTURE_MAX_AGE_MS) {
		throw new Error(
			"Staged browser capture is more than 7 days old; capture the source again and re-propose the review",
		);
	}
	const snapshot = buildRetainedApprovalSnapshot(review, approvalSourceUrl);
	if (!snapshot) {
		throw new Error(
			"Staged browser capture is incomplete; capture the source again and re-propose the review",
		);
	}
	return snapshot;
}

async function retrieveSourceForApproval(
	approvalSourceUrl: string,
	review: SourceReview,
	browserCapture?: BrowserCaptureInput,
	options: { reuseStagedCapture?: boolean } = {},
): Promise<{ retrieved: RetrievedSource; snapshot?: ApprovalSnapshot }> {
	if (browserCapture) {
		return {
			retrieved: await buildBrowserCapturedSource(
				approvalSourceUrl,
				browserCapture,
			),
		};
	}
	if (options.reuseStagedCapture && review.sourceEvidence.browserCapture) {
		return {
			retrieved: stagedCaptureSnapshot(review, approvalSourceUrl),
			snapshot: "staged_capture",
		};
	}
	try {
		return { retrieved: await retrieveEditorialSource(approvalSourceUrl) };
	} catch (error) {
		if (!isHostRefusalForApprovalFallback(error)) throw error;
		const retained = buildRetainedApprovalSnapshot(
			review,
			approvalSourceUrl,
		);
		if (!retained) throw error;
		return { retrieved: retained, snapshot: "collector" };
	}
}


function capturePathIsWithin(root: string, filePath: string): boolean {
	const child = relative(root, filePath);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

export interface CapturedDocumentReadOptions {
	/** Test seam used to replace the pathname after the descriptor is open. */
	afterOpen?: () => Promise<void>;
}

async function openedFilePath(
	filePath: string,
	fd: number,
	details: Awaited<ReturnType<Awaited<ReturnType<typeof open>>["stat"]>>,
): Promise<string> {
	try {
		return await realpath(`/proc/self/fd/${fd}`);
	} catch {
		// Non-Linux fallback: bind the resolved pathname back to the object that
		// is already open. A rename/replacement fails closed instead of changing
		// which bytes are read.
		const resolvedPath = await realpath(filePath);
		const current = await stat(resolvedPath);
		if (current.dev !== details.dev || current.ino !== details.ino) {
			throw new Error("Browser capture document changed while it was being opened");
		}
		return resolvedPath;
	}
}

async function readBoundedFile(
	handle: Awaited<ReturnType<typeof open>>,
	expectedSize: number,
): Promise<Uint8Array> {
	const bytes = Buffer.alloc(expectedSize);
	let offset = 0;
	while (offset < expectedSize) {
		const { bytesRead } = await handle.read(
			bytes, offset, expectedSize - offset, offset,
		);
		if (bytesRead === 0) break;
		offset += bytesRead;
	}
	const extra = Buffer.alloc(1);
	const { bytesRead: extraBytes } = await handle.read(extra, 0, 1, offset);
	if (offset !== expectedSize || extraBytes !== 0) {
		throw new Error("Browser capture document changed while it was being read");
	}
	return bytes;
}

export async function readCapturedDocument(
	filePath: string,
	options: CapturedDocumentReadOptions = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
	if (!isAbsolute(filePath)) {
		throw new Error("Browser capture document paths must be absolute");
	}
	const noFollow = fsConstants.O_NOFOLLOW ?? 0;
	const handle = await open(filePath, fsConstants.O_RDONLY | noFollow);
	try {
		await options.afterOpen?.();
		const details = await handle.stat();
		if (!details.isFile()) {
			throw new Error("Browser capture document path must identify a regular file");
		}
		if (details.size <= 0 || details.size > MAX_CAPTURED_DOCUMENT_BYTES) {
			throw new Error(
				`Browser capture document must be between 1 and ${MAX_CAPTURED_DOCUMENT_BYTES} bytes`,
			);
		}
		const resolvedPath = await openedFilePath(filePath, handle.fd, details);
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
		const bytes = await readBoundedFile(handle, details.size);
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
	} finally {
		await handle.close();
	}
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
	const requestedBy = input.requestedBy?.trim();
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
				const parsed = parseSourceUrl(canonical);
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
					!FINGERPRINT_METADATA_KEYS.has(normalizedKey) ||
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
				...(requestedBy ? { requestedBy } : {}),
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
	if (source.automation === "automatic") {
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
		dateEvidenceMatches(
			{
				date: input.sourceEvidence.publishedAt,
				precision: input.sourceEvidence.publishedAtPrecision,
			},
			recordDate,
			input.precision,
		)
	) {
		return input.sourceEvidence;
	}

	if (input.reviewedDate) {
		const reviewedDate = calendarDateValue(input.reviewedDate.date);
		const notes = input.reviewedDate.notes.trim();
		if (
			!dateEvidenceMatches(
				{ date: reviewedDate, precision: input.reviewedDate.precision },
				recordDate,
				input.precision,
			)
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
	if (dateEvidenceMatches(existing, recordDate, input.precision)) {
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
	const analysis = await analyseContentRelevance(
		cleanContent,
		canonicalUrl,
		document.title,
	);
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
		parseSourceUrl(canonicalUrl).hostname,
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
		slugify(analysisResult.title || parseSourceUrl(analysisResult.url).hostname) ||
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
		themes: [],
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

// A timeline replacement may share only its already-related policy's canonical
// URL. Do not exempt that policy's redirect aliases, other records, or drafts.
function timelineReplacementRelatedPolicy(
	target: TimelineEvent | undefined,
	proposed: TimelineEventDraft | undefined,
	sourceUrl: string,
	replacesSource: boolean,
	policies: Policy[],
): Policy | undefined {
	if (!replacesSource || !target?.relatedPolicyId ||
		proposed?.relatedPolicyId !== target.relatedPolicyId) return undefined;
	return policies.find((policy) => policy.id === target.relatedPolicyId &&
		sourceUrlsEqual(policy.sourceUrl, sourceUrl));
}

function collisionUrlsForPolicyOwner(
	urls: string[],
	relatedPolicy: Policy | undefined,
	ownerPolicyId: string | undefined,
): string[] {
	return relatedPolicy && ownerPolicyId === relatedPolicy.id
		? urls.filter((url) => !sourceUrlsEqual(url, relatedPolicy.sourceUrl))
		: urls;
}

function publishedPolicyReviewOwner(review: SourceReview): string | undefined {
	return review.entryKind === "policy" && review.status === "published"
		? review.proposedRecord.id : undefined;
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
	// A legislative record replaces the hand-typed timeline events on its
	// page when it publishes, so it does not compete with them for the source.
	const legislativeRecord =
		input.entryKind === "policy" &&
		input.proposedRecord !== undefined &&
		isLegislativeDraft(input.proposedRecord);
	const [trackedPolicies, trackedTimelineEvents] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
		legislativeRecord
			? []
			: getTimelineEvents(undefined, {
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
			? input.replaceTargetSource && input.targetRecordId
				? trackedTimelineEvents.find((event) => event.id === input.targetRecordId)
				: matchingTimelineEvents.find(
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
		const target = targetPolicy ?? targetTimelineEvent;
		if (
			!input.browserCapture ||
			!input.proposedRecord ||
			!input.targetRecordId ||
			!target ||
			sourceUrlsEqual(target.sourceUrl, canonicalUrl)
		) {
			throw new Error(
				"Replacing a tracked source requires a different official browser capture, the target record id, and an explicit proposedRecord",
			);
		}
		if (
			input.proposedRecord.id !== target.id ||
			!sourceUrlsEqual(input.proposedRecord.sourceUrl, canonicalUrl)
		) {
			throw new Error(
				"Source replacement proposedRecord must preserve the target record id and use the captured source URL",
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
				(input.replaceTargetSource || sourceUrlsEqual(review.sourceUrl, canonicalUrl)),
		);
	} else {
		existingReview = sourceReviews.find(
			(review) =>
				(review.status === "pending_review" || review.status === "approved") &&
				!review.targetPolicyId &&
				!timelineReviewTargetId(review) &&
				sourceUrlsEqual(review.sourceUrl, canonicalUrl),
		);
		if (
			!existingReview &&
			(await sourceUrlExists(canonicalUrl, { legislativeRecord }))
		) {
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
	let retrieved: RetrievedSource | undefined;
	if (targetPolicy || targetTimelineEvent || input.browserCapture) {
		retrieved = input.browserCapture
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
				parseSourceUrl(canonicalUrl).hostname,
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
		const relatedPolicy = timelineReplacementRelatedPolicy(
			targetTimelineEvent, input.proposedRecord as TimelineEventDraft | undefined,
			canonicalUrl, Boolean(input.replaceTargetSource), trackedPolicies,
		);
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
						collisionUrlsForPolicyOwner(collisionIdentityUrls, relatedPolicy, policy.id),
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
						collisionUrlsForPolicyOwner(collisionIdentityUrls, relatedPolicy, publishedPolicyReviewOwner(review)),
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
				...(input.replaceTargetSource
					? { targetTimelineEventPreviousSourceUrl: targetTimelineEvent.sourceUrl }
					: {}),
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
			const unchangedSinceStaging = retrieved
				? matchesRetrievedContent(retrieved, priorHash)
				: Boolean(priorHash && refreshedHash && priorHash === refreshedHash);
			const refreshesPendingCollectorEvidenceWithBrowserCapture =
				Boolean(input.browserCapture) &&
				existingReview.status === "pending_review" &&
				Boolean(targetPolicy || targetTimelineEvent);
			if (
				!unchangedSinceStaging &&
				!refreshesPendingCollectorEvidenceWithBrowserCapture
			) {
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
			proposal: undefined,
			decision: undefined,
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
	reuseStagedCapture?: boolean;
	decision?: SourceReviewDecision;
	/** Run every approval check without writing. */
	dryRun?: boolean;
}): Promise<SourceReview> {
	const review = await getSourceReviewById(input.id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	const writeApproval = async (
		updates: Partial<SourceReview>,
	): Promise<SourceReview> => {
		if (input.dryRun) return { ...review, ...updates };
		const updated = await updateSourceReview(review.id, updates);
		if (!updated) {
			throw new Error("Failed to approve staged source");
		}
		return updated;
	};
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
	if (
		stagedWithBrowserCapture !== Boolean(input.browserCapture) &&
		!(stagedWithBrowserCapture && input.reuseStagedCapture)
	) {
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
	const { retrieved, snapshot } = await retrieveSourceForApproval(
		approvalSourceUrl,
		review,
		input.browserCapture,
		{ reuseStagedCapture: input.reuseStagedCapture },
	);
	if (!replacesSource) {
		if (!review.sourceEvidence.contentHash) {
			throw new Error(
				"Staged source has no content fingerprint and must be re-staged before approval",
			);
		}
		if (!matchesRetrievedContent(retrieved, review.sourceEvidence.contentHash)) {
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
	const approvalNotes = withRetainedSnapshotApprovalNotes(
		input.approvalNotes,
		snapshot === "collector",
	);
	let manualExtractionEvidence: SourceEvidence["manualExtraction"];
	let document;
	if (snapshot) {
		const retainedText = retainedSnapshotBody(review);
		if (!retainedText) {
			throw new Error(
				"Collector-retained source snapshot has no usable text for approval",
			);
		}
		document = {
			title: review.sourceEvidence.title ?? review.title,
			text: retainedText,
			publishedAt: review.sourceEvidence.publishedAt,
			publishedAtPrecision: review.sourceEvidence.publishedAtPrecision,
		};
	} else {
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
				matchesRetrievedContent(retrieved, review.sourceEvidence.contentHash)
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
				notes: approvalNotes,
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
		const relatedPolicy = timelineReplacementRelatedPolicy(
			timelineCollision, event, review.sourceUrl,
			Boolean(review.targetTimelineEventPreviousSourceUrl), policies,
		);
		let targetTimelineRevisionHash: string | undefined;
		if (targetTimelineEventId && !timelineCollision) {
			throw new Error("Target timeline event for update review was not found");
		}
		if (timelineCollision) {
			if (targetTimelineEventId &&
				!sourceUrlsEqual(timelineCollision.sourceUrl, review.sourceUrl) &&
				!(review.targetTimelineEventPreviousSourceUrl && sourceUrlsEqual(
					timelineCollision.sourceUrl, review.targetTimelineEventPreviousSourceUrl,
				))) {
				throw new Error("Timeline update review source URL does not match the target event");
			}
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
					collisionUrlsForPolicyOwner(collisionIdentityUrls, relatedPolicy, existing.id),
					existing.sourceUrl,
					existing.verification.source,
				),
				);
			const reviewSourceUrlCollision = sourceReviews.find(
						(existing) =>
							existing.id !== review.id &&
							existing.status !== "rejected" &&
							sourceIdentityMatches(
								collisionUrlsForPolicyOwner(collisionIdentityUrls, relatedPolicy, publishedPolicyReviewOwner(existing)),
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
		return writeApproval({
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
			approvalNotes,
			decision: input.decision,
		});
	}

	const draft = proposedRecord as PolicyDraft;
	let targetPolicy: Policy | undefined;
	let replacesTargetPolicySource = false;
	const [policies, timelineEvents, sourceReviews] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
		// As at staging, a legislative record replaces the timeline events on its page.
		isLegislativeDraft(draft)
			? []
			: getTimelineEvents(undefined, {
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
			matchesRetrievedContent(retrieved, review.sourceEvidence.contentHash)
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
			notes: approvalNotes,
		},
	};
	const report = mergeReports(
		validatePolicies(
			[policy],
			new Set(policies.map((existing) => existing.id)),
		),
		validatePolicyThemes([policy]),
	);
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
	return writeApproval({
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
		approvalNotes,
		decision: input.decision,
	});
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
	options: PublishOptions,
): Promise<void> {
	const { browserCapture, reuseStagedCapture } = options;
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
	if (
		approvedWithBrowserCapture !== Boolean(browserCapture) &&
		!(approvedWithBrowserCapture && reuseStagedCapture)
	) {
		throw new Error(
			approvedWithBrowserCapture
				? "Browser-captured sources require a fresh browser capture before publication"
				: "A browser capture changes the retrieval method and requires a new staged review",
		);
	}
	const { retrieved } = await retrieveSourceForApproval(
		review.sourceUrl,
		review,
		browserCapture,
		{ reuseStagedCapture },
	);
	if (!matchesRetrievedContent(retrieved, approvedHash)) {
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
	const relatedPolicy = timelineReplacementRelatedPolicy(
		timelineEvents.find((event) => event.id === targetTimelineEventId),
		review.proposedRecord as TimelineEventDraft, review.sourceUrl,
		Boolean(review.targetTimelineEventPreviousSourceUrl), policies,
	);
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
					collisionUrlsForPolicyOwner(newlyAdoptedIdentityUrls, relatedPolicy, policy.id),
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
					collisionUrlsForPolicyOwner(newlyAdoptedIdentityUrls, relatedPolicy, publishedPolicyReviewOwner(candidate)),
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

interface PublishOptions {
	browserCapture?: BrowserCaptureInput;
	reuseStagedCapture?: boolean;
}

export function publishStagedSource(
	id: string,
	options: PublishOptions = {},
): Promise<SourceReview> {
	return withDataMutationLock(() =>
		publishStagedSourceUnlocked(id, options),
	);
}

async function publishStagedSourceUnlocked(
	id: string,
	options: PublishOptions = {},
): Promise<SourceReview> {
	const review = await getSourceReviewById(id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	const targetTimelineEventId = timelineReviewTargetId(review);
	if (review.status === "published") {
		if (targetTimelineEventId) {
			const olderPublishedReviews = (await getSourceReviews()).filter(
				(candidate) =>
					candidate.id !== review.id &&
					candidate.status === "published" &&
					timelineReviewTargetId(candidate) === targetTimelineEventId &&
					compareSourceReviewVersions(candidate, review) < 0,
			);
			for (const olderReview of olderPublishedReviews) {
				await reconcileLinkedDevelopment(olderReview, {
					status: "dismissed",
					dismissalReason: `Superseded by newer source update ${review.id}`,
				});
			}
		}
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
	if (review.targetPolicyId || targetTimelineEventId) {
		relatedUpdateReviews = (await getSourceReviews()).filter(
			(candidate) =>
				candidate.id !== review.id &&
				((review.targetPolicyId &&
					candidate.targetPolicyId === review.targetPolicyId) ||
					(targetTimelineEventId &&
						timelineReviewTargetId(candidate) === targetTimelineEventId)) &&
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
		options,
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
				!sourceUrlsEqual(existingEvent.sourceUrl, review.sourceUrl) &&
				!(review.targetTimelineEventPreviousSourceUrl &&
					sourceUrlsEqual(existingEvent.sourceUrl, review.targetTimelineEventPreviousSourceUrl))
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
		const existingPolicies = await getPolicies(undefined, {
			access: "admin",
		});
		const report = mergeReports(
			validatePolicies(
				[policy],
				new Set(existingPolicies.map((existing) => existing.id)),
			),
			validatePolicyThemes([policy]),
		);
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
		} else {
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
					legislativeRecord: isLegislativeDraft(policy),
				});
				if (duplicateExists) {
					throw new Error("Source URL already exists in tracked content");
				}
				await createPolicy(policy);
			}
			// Idempotent, so a retried publish finishes what a failed one began.
			if (isLegislativeDraft(policy)) {
				await retireTimelineEventsCiting(policy.sourceUrl);
			}
		}
	}
	for (const olderReview of relatedUpdateReviews) {
		if (compareSourceReviewVersions(olderReview, review) >= 0) {
			continue;
		}
		const supersessionReason = `Superseded by newer source update ${review.id}`;
		if (
			olderReview.status === "pending_review" ||
			olderReview.status === "approved"
		) {
			await reconcileLinkedDevelopment(olderReview, {
				status: "dismissed",
				dismissalReason: supersessionReason,
			});
			await updateSourceReview(olderReview.id, {
				status: "rejected",
				rejectionReason: supersessionReason,
			});
		} else if (olderReview.status === "published" && targetTimelineEventId) {
			await reconcileLinkedDevelopment(olderReview, {
				status: "dismissed",
				dismissalReason: supersessionReason,
			});
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

/**
 * Fingerprint of everything the editor approves: the staged record, its
 * source evidence, and any prepared approval inputs. Any later change to
 * the review produces a different hash, so an old decision cannot apply.
 */
export function sourceReviewProposalHash(review: SourceReview): string {
	return revisionHash({
		id: review.id,
		sourceUrl: review.sourceUrl,
		sourceEvidence: review.sourceEvidence,
		proposedRecord: review.proposedRecord,
		proposal: review.proposal,
	});
}

function proposalApprovalInput(review: SourceReview) {
	const proposal = review.proposal;
	return {
		id: review.id,
		proposedRecord: proposal?.proposedRecord,
		expectedTargetRevisionHash: proposal?.expectedTargetRevisionHash,
		officialSourceUrl: proposal?.officialSourceUrl,
		manualExtraction: proposal?.manualExtraction,
		reviewedDate: proposal?.reviewedDate,
		reuseStagedCapture: true,
	};
}

async function proposeSourceDecisionUnlocked(
	input: { id: string } & Omit<SourceReviewProposal, "proposedAt">,
): Promise<{ review: SourceReview; proposalHash: string }> {
	const { id, ...proposal } = input;
	const review = await getSourceReviewById(id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	if (review.status !== "pending_review") {
		throw new Error(
			`Only pending reviews can take a proposal; this review is ${review.status}`,
		);
	}
	if (!proposal.proposedBy.trim()) {
		throw new Error("A proposal must name who prepared it");
	}
	if (proposal.officialSourceUrl) {
		validateSourceUrl(proposal.officialSourceUrl);
	}
	const updated = await updateSourceReview(id, {
		proposal: { ...proposal, proposedAt: new Date().toISOString() },
		decision: undefined,
	});
	if (!updated) {
		throw new Error("Failed to record the proposal");
	}
	return { review: updated, proposalHash: sourceReviewProposalHash(updated) };
}

export function proposeSourceDecision(
	input: Parameters<typeof proposeSourceDecisionUnlocked>[0],
): ReturnType<typeof proposeSourceDecisionUnlocked> {
	return withDataMutationLock(() => proposeSourceDecisionUnlocked(input));
}

/** What a decision card shows: the record before and after, and its evidence. */
export async function describeSourceProposal(id: string) {
	const review = await getSourceReviewById(id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	const targetTimelineEventId = timelineReviewTargetId(review);
	const current = review.targetPolicyId
		? (await getPolicies(undefined, { access: "admin" })).find(
				(policy) => policy.id === review.targetPolicyId,
			)
		: targetTimelineEventId
			? (
					await getTimelineEvents(undefined, {
						includeGenerated: false,
						access: "admin",
					})
				).find((event) => event.id === targetTimelineEventId)
			: undefined;
	const capture = review.sourceEvidence.browserCapture;
	const proposalHash = sourceReviewProposalHash(review);
	const blockers: string[] = [];
	if (review.status !== "pending_review") {
		blockers.push(`This review is ${review.status}`);
	} else {
		await approveStagedSourceUnlocked({
			...proposalApprovalInput(review),
			actor: "Editor (preview)",
			dryRun: true,
		}).catch((error: unknown) => {
			blockers.push(error instanceof Error ? error.message : String(error));
		});
	}
	return {
		id: review.id,
		title: review.title,
		entryKind: review.entryKind,
		status: review.status,
		sourceUrl: review.sourceUrl,
		current: current ?? null,
		proposed: review.proposal?.proposedRecord ?? review.proposedRecord,
		proposal: review.proposal ?? null,
		evidence: {
			retrievedAt: review.sourceEvidence.retrievedAt,
			contentHash: review.sourceEvidence.contentHash,
			...(capture
				? {
						capturedAt: capture.capturedAt,
						capturedBy: capture.capturedBy,
						requestedBy: capture.requestedBy,
						usableUntil: new Date(
							Date.parse(capture.capturedAt) + STAGED_CAPTURE_MAX_AGE_MS,
						).toISOString(),
					}
				: {}),
		},
		proposalHash,
		proposalCode: proposalHash.slice(0, 8),
		/** Approval checks that would refuse this proposal today. Post a card only when empty. */
		blockers,
	};
}

async function decideSourceReviewUnlocked(input: {
	id: string;
	proposalHash: string;
	reviewer: string;
	attestationUrl: string;
}): Promise<SourceReview> {
	const review = await getSourceReviewById(input.id);
	if (!review) {
		throw new Error("Staged source not found");
	}
	if (review.decision?.proposalHash === input.proposalHash) {
		if (review.status === "published") return review;
		if (review.status === "approved") {
			return publishStagedSourceUnlocked(review.id, {
				reuseStagedCapture: true,
			});
		}
	}
	if (review.status !== "pending_review") {
		throw new Error(
			`This review is ${review.status}; propose it again before deciding`,
		);
	}
	if (sourceReviewProposalHash(review) !== input.proposalHash) {
		throw new Error(
			"The review changed after its decision card was posted; post a new card for the current proposal",
		);
	}
	const approvalNotes = [
		`Approved by ${input.reviewer} on decision card ${input.attestationUrl} (proposal ${input.proposalHash.slice(0, 8)}).`,
		`Proposed by ${review.proposal?.proposedBy ?? review.createdBy}.`,
		review.proposal?.notes?.trim(),
	]
		.filter(Boolean)
		.join(" ");
	await approveStagedSourceUnlocked({
		...proposalApprovalInput(review),
		actor: input.reviewer,
		approvalNotes,
		decision: {
			proposalHash: input.proposalHash,
			decidedBy: input.reviewer,
			decidedAt: new Date().toISOString(),
			attestationUrl: input.attestationUrl,
		},
	});
	return publishStagedSourceUnlocked(review.id, { reuseStagedCapture: true });
}

/**
 * Applies the editor's decision: approves exactly the proposal that the
 * decision card showed and publishes it. Retrying the same decision resumes
 * a publication that failed part-way.
 */
export function decideSourceReview(
	input: Parameters<typeof decideSourceReviewUnlocked>[0],
): ReturnType<typeof decideSourceReviewUnlocked> {
	return withDataMutationLock(() => decideSourceReviewUnlocked(input));
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

/**
 * Stamp a public register record as editorially verified. Used when Daniel
 * names that policy id in Policai Signal. Refuses withheld, unverified, and
 * trashed records — those stay on the staged-review publish path.
 */
async function verifyRegisterRecordUnlocked(input: {
	policyId: string;
	actor: string;
	notes?: string;
	now?: string;
}): Promise<Policy> {
	const actor = input.actor.replace(/\s+/g, " ").trim();
	if (!actor) {
		throw new Error("A human reviewer identity is required");
	}
	const policyId = input.policyId.trim();
	if (!policyId) {
		throw new Error("A register policy id is required");
	}
	const now = input.now ?? new Date().toISOString();
	const publicPolicy = await getPolicyById(policyId);
	if (!publicPolicy) {
		const adminPolicy = await getPolicyById(policyId, { access: "admin" });
		if (!adminPolicy) {
			throw new Error(`Register record ${policyId} not found`);
		}
		if (adminPolicy.status === "trashed") {
			throw new Error(`Register record ${policyId} is trashed`);
		}
		throw new Error(
			`Register record ${policyId} is not public (withheld or unverified); approve and publish its staged review instead`,
		);
	}
	const notes =
		input.notes?.replace(/\s+/g, " ").trim() ||
		`Verified via Policai Signal by ${actor}`;
	const updated = await updatePolicy(policyId, {
		lastReviewedAt: now,
		verification: {
			...publicPolicy.verification,
			status: "verified",
			checkedAt: now,
			checkedBy: actor,
			method: "manual",
			notes,
		},
	});
	if (!updated) {
		throw new Error(`Register record ${policyId} not found`);
	}
	return updated;
}

export function verifyRegisterRecord(
	input: Parameters<typeof verifyRegisterRecordUnlocked>[0],
): ReturnType<typeof verifyRegisterRecordUnlocked> {
	return withDataMutationLock(() => verifyRegisterRecordUnlocked(input));
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
