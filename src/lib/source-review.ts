import type {
	Development,
	Policy,
	RecordVerification,
	SourceEvidence,
	SourceReview,
	TimelineEvent,
} from "@/types";
import { sourceUrlIdentity, sourceUrlsEqual } from "@/lib/source-url";

export function linkedDevelopmentId(
	review: SourceReview,
): string | null {
	if (review.linkedDevelopment?.id.startsWith("dev-")) {
		return review.linkedDevelopment.id;
	}
	const id = review.id.replace(/^source-review-/, "");
	return id.startsWith("dev-") ? id : null;
}

/**
 * Merge collector-produced review snapshots by stable id. Current collector
 * output wins because recovered candidates may have newer extraction,
 * classification, proposed-record, and linked-development evidence.
 *
 * A watched document gets a new review id for each content version, so a
 * new version replaces any still-pending collector review of the same page
 * rather than standing beside it as a duplicate sourceUrl.
 */
export interface PublishedRecordRef {
	kind: "policy" | "timeline_event";
	id: string;
	sourceUrl: string;
	verification: RecordVerification;
}

function sameEvidence(left: SourceEvidence, right: SourceEvidence): boolean {
	return (
		Boolean(left.contentHash) &&
		left.contentHash === right.contentHash &&
		sourceUrlsEqual(left.url, right.url)
	);
}

/**
 * Developments a published review promoted into `recordId`: the record's
 * intake rows, whatever page or evidence they were last verified from.
 */
export function originDevelopmentIds(
	reviews: readonly SourceReview[],
	recordId: string,
): Set<string> {
	const ids = new Set<string>();
	for (const review of reviews) {
		if (review.status !== "published") continue;
		const record = review.proposedRecord as { id?: string } | undefined;
		const developmentId = linkedDevelopmentId(review);
		if (record?.id === recordId && developmentId) ids.add(developmentId);
	}
	return ids;
}

/**
 * Promoted developments that a signed publication of `record` renews: those
 * the record was promoted from (`originIds`), and those verified from the
 * record's evidence before or after publication. A renewed development takes
 * the published verification and the record's source page, so it follows the
 * record when the review moves it to a new URL.
 */
export function developmentsRenewedByPublication(
	developments: readonly Development[],
	record: PublishedRecordRef,
	previousSource: SourceEvidence | undefined,
	excludeId: string | null,
	originIds: ReadonlySet<string> = new Set(),
): Development[] {
	return developments.filter((development) => {
		if (development.id === excludeId || development.status !== "promoted") {
			return false;
		}
		const related =
			record.kind === "timeline_event"
				? development.relatedTimelineEventId === record.id
				: development.relatedPolicyId === record.id;
		if (!related || development.verification?.method !== "manual") return false;
		if (originIds.has(development.id)) return true;
		const source = development.verification.source;
		return (
			(previousSource !== undefined && sameEvidence(source, previousSource)) ||
			sameEvidence(source, record.verification.source)
		);
	});
}

export function developmentRenewal(
	record: PublishedRecordRef,
): Pick<Development, "url" | "verification"> {
	return { url: record.sourceUrl, verification: record.verification };
}

export function mergeSourceReviews(
	existing: SourceReview[],
	updates: SourceReview[],
): SourceReview[] {
	const existingById = new Map(
		existing.map((review) => [review.id, review]),
	);
	const updateById = new Map<string, SourceReview>();
	for (const update of updates) {
		const previous = existingById.get(update.id);
		const sameDocumentTransition =
			previous &&
			update.sourceVersionSequence !== undefined &&
			previous.sourceVersionSequence === update.sourceVersionSequence &&
			previous.sourceEvidence.contentHash ===
				update.sourceEvidence.contentHash;
		updateById.set(
			update.id,
			sameDocumentTransition
				? {
						...update,
						discoveredAt: previous.discoveredAt,
						linkedDevelopment:
							update.linkedDevelopment && previous.linkedDevelopment
								? {
										...update.linkedDevelopment,
										detectedAt:
											previous.linkedDevelopment.detectedAt,
									}
								: update.linkedDevelopment,
					}
				: update,
		);
	}
	const supersededUrls = new Set(
		[...updateById.values()]
			.filter(isUntargetedCollectorReview)
			.map((review) => sourceUrlIdentity(review.sourceUrl)),
	);
	return [
		...updateById.values(),
		...existing.filter(
			(review) =>
				!updateById.has(review.id) &&
				!(
					isUntargetedCollectorReview(review) &&
					supersededUrls.has(sourceUrlIdentity(review.sourceUrl))
				),
		),
	];
}

function isUntargetedCollectorReview(review: SourceReview): boolean {
	return (
		review.status === "pending_review" &&
		review.createdBy === "collector" &&
		!review.targetPolicyId &&
		!review.targetTimelineEventId &&
		!review.targetTimelineRevisionHash
	);
}

export function reconcileLinkedDevelopments(
	reviews: SourceReview[],
	developments: Development[],
): Development[] {
	const byId = new Map(
		developments.map((development) => [development.id, development]),
	);
	for (const review of reviews) {
		const retainedSnapshot = review.linkedDevelopment;
		let linked = retainedSnapshot;
		const expectedId = linkedDevelopmentId(review);
		if (review.status === "rejected") {
			if (!expectedId) continue;
			const existing = byId.get(expectedId);
			const recoverable = existing ?? linked;
			if (recoverable && recoverable.id === expectedId) {
				byId.set(expectedId, {
					...recoverable,
					status: "dismissed",
					dismissalReason:
						review.rejectionReason || "Rejected during editorial review",
				});
			}
			continue;
		}
		if (linked && review.status === "published") {
			const assessedAt =
				review.reviewedAt ??
				review.publishedAt ??
				linked.assessment.assessedAt;
			if (review.entryKind === "timeline_event") {
				const event = review.proposedRecord as TimelineEvent;
				linked = {
					...linked,
					title: event.title,
					url: event.sourceUrl,
					jurisdiction: event.jurisdiction,
					publishedAt:
						event.date instanceof Date
							? event.date.toISOString().slice(0, 10)
							: event.date,
					publishedAtPrecision: event.datePrecision,
					summary: event.description,
					status: "promoted",
					verification: event.verification,
					relatedPolicyId: event.relatedPolicyId,
					relevanceScore: 1,
					classification: "curated",
					assessment: {
						method: "editorial",
						assessedAt,
						promptVersion: "editorial-review-v1",
					},
					dismissalReason: undefined,
				};
			} else {
				const policy = review.proposedRecord as Policy;
				const primaryDate = policy.dates?.find(
					(date) => date.primary,
				);
				linked = {
					...linked,
					title: policy.title,
					url: policy.sourceUrl,
					jurisdiction: policy.jurisdiction,
					publishedAt:
						primaryDate?.date instanceof Date
							? primaryDate.date.toISOString().slice(0, 10)
							: primaryDate?.date,
					publishedAtPrecision: primaryDate?.precision,
					summary: policy.description,
					status: "promoted",
					verification: policy.verification,
					relatedPolicyId: policy.id,
					relevanceScore: 1,
					classification: "curated",
					assessment: {
						method: "editorial",
						assessedAt,
						promptVersion: "editorial-review-v1",
					},
					dismissalReason: undefined,
				};
			}
		}
		if (linked && expectedId && linked.id === expectedId) {
			const existing = byId.get(expectedId);
			if (
				!existing ||
				(review.status === "published" &&
					existing.status === "detected")
			) {
				byId.set(expectedId, linked);
			}
		}
	}
	return Array.from(byId.values());
}
