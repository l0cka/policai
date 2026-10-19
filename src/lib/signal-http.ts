import type { PolicyDraft, SourceReview, TimelineEventDraft } from "@/types";
import { getJurisdictionName, getPolicyTypeName } from "@/types";
import {
	formatSignalInstant,
	isSignalReviewer,
	signalReviewers,
} from "@/lib/signal-source-reviews";

/**
 * HTTPS Signal API helpers for the Policai Signal Grok Bot. Auth is
 * POLICAI_SIGNAL_TOKEN only. Approve publishes; dismiss rejects. Attestation
 * never claims a TTY confirmation.
 */

export const SIGNAL_HTTP_REVIEWER_DEFAULT = "Daniel Alkurdi";

export type SignalHttpAction = "approve" | "dismiss";

export interface SignalAttestationInput {
	/** Daniel's chat reply, verbatim. */
	replyText: string;
	/** Stable id of the chat message that carried the decision. */
	chatMessageId: string;
	/** Card / source-review id the decision refers to. */
	cardId: string;
	/** Optional ISO instant; server fills Australia/Sydney display. */
	decidedAt?: string;
}

export interface SignalHttpDecisionInput {
	reviewId: string;
	action: SignalHttpAction;
	reviewer: string;
	attestation: SignalAttestationInput;
}

export interface SignalHttpDeps {
	getReview: (id: string) => Promise<SourceReview | null>;
	approve: (input: {
		id: string;
		actor: string;
		approvalNotes: string;
	}) => Promise<SourceReview>;
	publish: (id: string) => Promise<SourceReview>;
	reject: (id: string, reason?: string) => Promise<SourceReview>;
	env?: Readonly<Record<string, string | undefined>>;
	now?: () => Date;
}

export type SignalHttpResult =
	| {
			ok: true;
			noop: boolean;
			action: SignalHttpAction;
			review: SourceReview;
			attestationText: string;
			message: string;
	  }
	| {
			ok: false;
			status: number;
			code: string;
			error: string;
	  };

export type SignalDryRunResult =
	| {
			ok: true;
			review: {
				id: string;
				status: SourceReview["status"];
				title: string;
				sourceUrl: string;
				entryKind: SourceReview["entryKind"];
				targetPolicyId?: string;
				targetTimelineEventId?: string;
				themes: string[];
				jurisdiction?: string;
				change: string;
			};
			approve: {
				allowed: boolean;
				wouldPublish: boolean;
				blockers: string[];
				noopIf: string | null;
			};
			dismiss: {
				allowed: boolean;
				blockers: string[];
				noopIf: string | null;
			};
	  }
	| {
			ok: false;
			status: number;
			code: string;
			error: string;
	  };

export function requireSignalHttpToken(
	requestToken: string | undefined,
	env: Readonly<Record<string, string | undefined>> = process.env,
): { ok: true } | { ok: false; status: number; code: string; error: string } {
	const expected = env.POLICAI_SIGNAL_TOKEN?.trim();
	if (!expected) {
		return {
			ok: false,
			status: 503,
			code: "signal_token_unconfigured",
			error: "POLICAI_SIGNAL_TOKEN is not configured on the host",
		};
	}
	if (!requestToken || requestToken !== expected) {
		return {
			ok: false,
			status: 401,
			code: "unauthorized",
			error: "Invalid or missing POLICAI_SIGNAL_TOKEN",
		};
	}
	return { ok: true };
}

export function bearerToken(authorization: string | null): string | undefined {
	if (!authorization) return undefined;
	const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
	return match?.[1]?.trim() || undefined;
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function formatSignalAttestation(
	input: SignalAttestationInput,
	reviewer: string,
	now = new Date(),
): string {
	const decidedAt = input.decidedAt?.trim() || now.toISOString();
	const sydney = formatSignalInstant(decidedAt);
	const reply = oneLine(input.replyText);
	const chatMessageId = oneLine(input.chatMessageId);
	const cardId = oneLine(input.cardId);
	if (!reply) throw new Error("attestation.replyText is required");
	if (!chatMessageId) throw new Error("attestation.chatMessageId is required");
	if (!cardId) throw new Error("attestation.cardId is required");
	return [
		`${oneLine(reviewer)} (Signal): ${reply}`,
		`chatMessageId: ${chatMessageId}`,
		`cardId: ${cardId}`,
		`decided: ${sydney} (${decidedAt})`,
		"relayed by Policai Signal",
	].join("\n");
}

function changeLine(review: SourceReview): string {
	if (review.targetPolicyId) {
		return review.targetPolicyPreviousSourceUrl
			? `Would replace the source URL of register record ${review.targetPolicyId}.`
			: `Would update register record ${review.targetPolicyId} in place.`;
	}
	if (review.targetTimelineEventId || review.targetTimelineRevisionHash) {
		const label = review.targetTimelineEventId ?? "the tracked timeline event";
		return review.targetTimelineEventPreviousSourceUrl
			? `Would replace the source URL of timeline event ${label}.`
			: `Would update timeline event ${label} in place.`;
	}
	if (review.entryKind === "timeline_event") {
		return "Would add a timeline event.";
	}
	const type = (review.proposedRecord as PolicyDraft).type;
	if (!type) return "Would add a new register record.";
	return `Would add a new ${getPolicyTypeName(type).toLowerCase()} record.`;
}

function themesOf(review: SourceReview): string[] {
	if (review.entryKind === "timeline_event") return [];
	const themes = (review.proposedRecord as PolicyDraft).themes;
	if (!Array.isArray(themes)) return [];
	return themes.map((theme) => String(theme));
}

function jurisdictionOf(review: SourceReview): string | undefined {
	const record = review.proposedRecord as PolicyDraft | TimelineEventDraft;
	const fromRecord = record.jurisdiction?.trim();
	if (fromRecord) return getJurisdictionName(fromRecord);
	const suggested = review.analysis.suggestedJurisdiction;
	if (typeof suggested === "string" && suggested.trim()) {
		return getJurisdictionName(suggested.trim());
	}
	return undefined;
}

function isTrackedRecordReview(review: SourceReview): boolean {
	return Boolean(
		review.targetPolicyId ||
			review.targetTimelineEventId ||
			review.targetTimelineRevisionHash,
	);
}

function approveBlockers(review: SourceReview): string[] {
	const blockers: string[] = [];
	if (review.status === "rejected") {
		blockers.push("Rejected sources cannot be approved");
	}
	if (review.entryKind === "policy") {
		const themes = themesOf(review);
		if (themes.length === 0) {
			blockers.push(
				"Policy draft has no themes; supply an explicit proposedRecord with themes via editorial MCP before Signal can approve. The bot must not invent themes.",
			);
		}
	}
	return blockers;
}

function dismissBlockers(review: SourceReview): string[] {
	const blockers: string[] = [];
	if (isTrackedRecordReview(review)) {
		blockers.push(
			"Tracked-record reviews must be approved and published to re-verify the target; they cannot be dismissed",
		);
	}
	if (review.status === "published") {
		blockers.push("Published sources cannot be rejected");
	}
	return blockers;
}

export function previewSignalReview(review: SourceReview): SignalDryRunResult {
	const approveBlocks = approveBlockers(review);
	const dismissBlocks = dismissBlockers(review);
	return {
		ok: true,
		review: {
			id: review.id,
			status: review.status,
			title: review.title,
			sourceUrl: review.sourceUrl,
			entryKind: review.entryKind,
			targetPolicyId: review.targetPolicyId,
			targetTimelineEventId: review.targetTimelineEventId,
			themes: themesOf(review),
			jurisdiction: jurisdictionOf(review),
			change: changeLine(review),
		},
		approve: {
			allowed: review.status !== "published" && approveBlocks.length === 0,
			wouldPublish: true,
			blockers: approveBlocks,
			noopIf:
				review.status === "published"
					? "Review is already published; approve is a no-op"
					: null,
		},
		dismiss: {
			allowed: review.status !== "rejected" && dismissBlocks.length === 0,
			blockers: dismissBlocks,
			noopIf:
				review.status === "rejected"
					? "Review is already rejected; dismiss is a no-op"
					: null,
		},
	};
}

export async function dryRunSignalReview(
	id: string,
	deps: SignalHttpDeps,
): Promise<SignalDryRunResult> {
	const review = await deps.getReview(id.trim());
	if (!review) {
		return {
			ok: false,
			status: 404,
			code: "not_found",
			error: `Source review ${id} not found`,
		};
	}
	return previewSignalReview(review);
}

export async function applySignalHttpDecision(
	input: SignalHttpDecisionInput,
	deps: SignalHttpDeps,
): Promise<SignalHttpResult> {
	const env = deps.env ?? process.env;
	const reviewId = input.reviewId.trim();
	const reviewer = input.reviewer.replace(/\s+/g, " ").trim();
	if (!reviewId) {
		return {
			ok: false,
			status: 400,
			code: "invalid_request",
			error: "reviewId is required",
		};
	}
	if (input.action !== "approve" && input.action !== "dismiss") {
		return {
			ok: false,
			status: 400,
			code: "invalid_action",
			error: 'action must be "approve" or "dismiss"',
		};
	}
	if (!reviewer) {
		return {
			ok: false,
			status: 400,
			code: "invalid_request",
			error: "reviewer is required",
		};
	}
	if (!isSignalReviewer(reviewer, env)) {
		return {
			ok: false,
			status: 403,
			code: "reviewer_not_allowlisted",
			error: `Signal reviewer must be one of: ${signalReviewers(env).join(", ")}`,
		};
	}

	let attestationText: string;
	try {
		attestationText = formatSignalAttestation(
			input.attestation,
			reviewer,
			deps.now?.() ?? new Date(),
		);
	} catch (error) {
		return {
			ok: false,
			status: 400,
			code: "invalid_attestation",
			error: error instanceof Error ? error.message : String(error),
		};
	}

	if (oneLine(input.attestation.cardId) !== reviewId) {
		return {
			ok: false,
			status: 400,
			code: "attestation_card_mismatch",
			error: "attestation.cardId must match reviewId",
		};
	}

	const review = await deps.getReview(reviewId);
	if (!review) {
		return {
			ok: false,
			status: 404,
			code: "not_found",
			error: `Source review ${reviewId} not found`,
		};
	}

	if (input.action === "approve") {
		if (review.status === "published") {
			return {
				ok: true,
				noop: true,
				action: "approve",
				review,
				attestationText,
				message: `Already published ${review.id}; no-op`,
			};
		}
		const blockers = approveBlockers(review);
		if (blockers.length > 0) {
			return {
				ok: false,
				status: 409,
				code: "approve_blocked",
				error: blockers.join("; "),
			};
		}
		try {
			let current = review;
			if (current.status !== "approved") {
				current = await deps.approve({
					id: reviewId,
					actor: reviewer,
					approvalNotes: attestationText,
				});
			}
			const published = await deps.publish(reviewId);
			return {
				ok: true,
				noop: false,
				action: "approve",
				review: published,
				attestationText,
				message: `Approved and published ${published.id}`,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const code = /theme/i.test(message)
				? "themes_required"
				: /proposedRecord|officialSourceUrl|reviewedDate|primary date/i.test(
							message,
					  )
					? "editorial_fields_required"
					: "approve_failed";
			return { ok: false, status: 409, code, error: message };
		}
	}

	if (review.status === "rejected") {
		return {
			ok: true,
			noop: true,
			action: "dismiss",
			review,
			attestationText,
			message: `Already rejected ${review.id}; no-op`,
		};
	}
	const dismissBlocks = dismissBlockers(review);
	if (dismissBlocks.length > 0) {
		return {
			ok: false,
			status: 409,
			code: "dismiss_blocked",
			error: dismissBlocks.join("; "),
		};
	}
	try {
		const rejected = await deps.reject(
			reviewId,
			`Dismissed by ${reviewer}.\n${attestationText}`,
		);
		return {
			ok: true,
			noop: false,
			action: "dismiss",
			review: rejected,
			attestationText,
			message: `Dismissed ${rejected.id}`,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			status: 409,
			code: /tracked-record|cannot be rejected/i.test(message)
				? "tracked_record_dismiss"
				: "dismiss_failed",
			error: message,
		};
	}
}
