import { isValidCalendarDate } from "@/lib/calendar-date";
import {
	getPolicies,
	getSourceReviews,
	getTimelineEvents,
} from "@/lib/data-service";
import { isLegislativeDraft } from "@/lib/legislation/model";
import {
	matchesRetrievedContent,
	type RetrievedSource,
} from "@/lib/pipeline/fetch";
import { policyRevisionHash, timelineRevisionHash } from "@/lib/policy-revision";
import type { ReviewedDateInput } from "@/lib/source-ingest";
import {
	canonicalizeSourceEvidence,
	sourceIdentityUrls,
	sourceUrlsEqual,
} from "@/lib/source-url";
import {
	dateEvidenceMatches,
	mergeReports,
	validatePolicies,
	validatePolicyThemes,
	validateTimeline,
} from "@/lib/validate-data";
import type {
	DatePrecision,
	Development,
	Policy,
	PolicyDraft,
	SourceEvidence,
	SourceReview,
	SourceReviewDecision,
	SourceReviewEntryKind,
	TimelineEvent,
	TimelineEventDraft,
} from "@/types";

export function sourceIdentityMatches(
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

export function sourceIdentityUrlsNotOwnedBy(
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

export function withProspectiveTimelineEvent(
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

export function timelineRelatedPolicy(
	target: TimelineEvent | undefined,
	proposed: TimelineEventDraft | undefined,
	sourceUrl: string,
	replacesSource: boolean,
	policies: Policy[],
): Policy | undefined {
	const relatedPolicyId = replacesSource
		? target?.relatedPolicyId && proposed?.relatedPolicyId === target.relatedPolicyId
			? target.relatedPolicyId
			: undefined
		: target
			? undefined
			: proposed?.relatedPolicyId;
	if (!relatedPolicyId) return undefined;
	return policies.find((policy) => policy.id === relatedPolicyId &&
		sourceUrlsEqual(policy.sourceUrl, sourceUrl));
}

export function collisionUrlsForPolicyOwner(
	urls: string[],
	relatedPolicy: Policy | undefined,
	ownerPolicyId: string | undefined,
): string[] {
	return relatedPolicy && ownerPolicyId === relatedPolicy.id
		? urls.filter((url) => !sourceUrlsEqual(url, relatedPolicy.sourceUrl))
		: urls;
}

export function publishedPolicyReviewOwner(review: SourceReview): string | undefined {
	return review.entryKind === "policy" && review.status === "published"
		? review.proposedRecord.id : undefined;
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

export function assertTargetRevisionApprovable(
	review: SourceReview,
	targetPolicy: Policy,
	input: { proposedRecord?: unknown; expectedTargetRevisionHash?: string },
): void {
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
}

export function wasPublishedFromReview(
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

export interface ApprovalInput {
	actor: string;
	proposedRecord?: PolicyDraft | TimelineEventDraft;
	expectedTargetRevisionHash?: string;
	reviewedDate?: ReviewedDateInput;
	decision?: SourceReviewDecision;
}

export interface ApprovalContext {
	review: SourceReview;
	input: ApprovalInput;
	retrieved: RetrievedSource;
	sourceUrl: string;
	sourceEvidence: SourceEvidence;
	approvalSourceIdentityUrls: string[];
	approvalNotes: string | undefined;
	now: string;
	proposedRecord: PolicyDraft | TimelineEventDraft;
	targetTimelineEventId: string | undefined;
	writeApproval: (updates: Partial<SourceReview>) => Promise<SourceReview>;
}

async function approveTimelineReview(ctx: ApprovalContext): Promise<SourceReview> {
	const {
		review,
		input,
		retrieved,
		sourceUrl,
		approvalSourceIdentityUrls,
		approvalNotes,
		now,
		proposedRecord,
		writeApproval,
		targetTimelineEventId,
	} = ctx;
	let { sourceEvidence } = ctx;
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
	const relatedPolicy = timelineRelatedPolicy(
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

async function approvePolicyReview(ctx: ApprovalContext): Promise<SourceReview> {
	const {
		review,
		input,
		retrieved,
		sourceUrl,
		approvalSourceIdentityUrls,
		approvalNotes,
		now,
		proposedRecord,
		writeApproval,
	} = ctx;
	let { sourceEvidence } = ctx;
	const draft = proposedRecord as PolicyDraft;
	let targetPolicy: Policy | undefined;
	let replacesTargetPolicySource = false;
	const [policies, timelineEvents, sourceReviews] = await Promise.all([
		getPolicies(undefined, { access: "admin" }),
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
		assertTargetRevisionApprovable(review, targetPolicy, input);
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

export const approveByEntryKind: Record<
	SourceReviewEntryKind,
	(ctx: ApprovalContext) => Promise<SourceReview>
> = {
	policy: approvePolicyReview,
	timeline_event: approveTimelineReview,
};
