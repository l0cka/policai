import type {
	Development,
	Policy,
	SourceReview,
	TimelineEvent,
} from "@/types";

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
 */
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
	return [
		...updateById.values(),
		...existing.filter((review) => !updateById.has(review.id)),
	];
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
