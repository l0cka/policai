import type { PolicyDraft, SourceReview, TimelineEventDraft } from "@/types";
import { getJurisdictionName, getPolicyTypeName } from "@/types";

/**
 * Read-only cards for pending source reviews, and the apply command that
 * calls the existing approve and reject paths. Approval receives only the
 * review id and reviewer name. This module does not publish.
 */

export interface SignalSourceReviewDeps {
	listPending: () => Promise<SourceReview[]>;
	approve: (input: { id: string; actor: string }) => Promise<SourceReview>;
	reject: (id: string, reason?: string) => Promise<SourceReview>;
}

export interface SignalSourceReviewResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
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

export function formatSourceReviewCard(review: SourceReview): string {
	const lines = [
		`id: ${oneLine(review.id)}`,
		`title: ${oneLine(review.title)}`,
		`url: ${review.sourceUrl.trim()}`,
	];
	const jurisdiction = jurisdictionOf(review);
	if (jurisdiction) lines.push(`jurisdiction: ${jurisdiction}`);
	lines.push(`change: ${changeLine(review)}`);
	return lines.join("\n");
}

function pendingReviews(reviews: readonly SourceReview[]): SourceReview[] {
	return reviews
		.filter((review) => review.status === "pending_review")
		.slice()
		.sort((a, b) => {
			const byDate =
				new Date(b.discoveredAt).getTime() -
				new Date(a.discoveredAt).getTime();
			if (byDate !== 0 && !Number.isNaN(byDate)) return byDate;
			return a.id.localeCompare(b.id, "en-AU");
		});
}

function footer(count: number): string {
	if (count === 1) return "1 pending source review.";
	return `${count} pending source reviews.`;
}

/** Pending reviews only. No network and no file access. */
export function formatPendingSourceReviewCards(
	reviews: readonly SourceReview[],
): string {
	const pending = pendingReviews(reviews);
	if (pending.length === 0) return "No pending source reviews.";
	return `${pending.map(formatSourceReviewCard).join("\n\n")}\n\n${footer(pending.length)}`;
}

function argument(argv: readonly string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function reviewerName(value: string | undefined): string | undefined {
	const reviewer = value?.replace(/\s+/g, " ").trim();
	return reviewer ? reviewer : undefined;
}

export async function runSignalSourceReviewCommand(
	argv: readonly string[],
	deps: SignalSourceReviewDeps,
): Promise<SignalSourceReviewResult> {
	if (argv.length === 0) {
		const reviews = await deps.listPending();
		return {
			exitCode: 0,
			stdout: formatPendingSourceReviewCards(reviews),
			stderr: "",
		};
	}

	if (argv[0] !== "apply") {
		return {
			exitCode: 2,
			stdout: "",
			stderr:
				"Usage: signal:reviews [apply --action=approve|dismiss --id=<id> --reviewer=<name>]",
		};
	}

	const action = argument(argv, "action");
	const id = argument(argv, "id")?.trim();
	const reviewer = reviewerName(argument(argv, "reviewer"));
	if (action !== "approve" && action !== "dismiss") {
		return {
			exitCode: 2,
			stdout: "",
			stderr: "Action must be approve or dismiss.",
		};
	}
	if (!id) {
		return {
			exitCode: 2,
			stdout: "",
			stderr: "A source review id is required.",
		};
	}
	if (!reviewer) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: "A human reviewer identity is required.",
		};
	}

	try {
		if (action === "approve") {
			const review = await deps.approve({ id, actor: reviewer });
			return {
				exitCode: 0,
				stdout: `Approved ${review.id} (status ${review.status}).`,
				stderr: "",
			};
		}
		const review = await deps.reject(id, `Dismissed by ${reviewer}`);
		return {
			exitCode: 0,
			stdout: `Dismissed ${review.id} (status ${review.status}).`,
			stderr: "",
		};
	} catch (error) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}
