import os from "node:os";
import type { PolicyDraft, SourceReview, TimelineEventDraft } from "@/types";
import { getJurisdictionName, getPolicyTypeName } from "@/types";

/**
 * Read-only cards for pending source reviews, and the apply command that
 * calls the existing approve and reject paths. Apply refuses unless a human
 * confirms the reviewer name at a terminal. It does not publish.
 */

/** One-line analysis summary, including the ellipsis when truncated. */
export const SIGNAL_CARD_SUMMARY_LIMIT = 160;

const SYDNEY_INSTANT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZone: "Australia/Sydney",
	timeZoneName: "short",
};

export interface SignalCommandRunner {
	user: string;
	host: string;
	at: string;
}

export interface SignalSourceReviewDeps {
	listPending: () => Promise<SourceReview[]>;
	approve: (input: {
		id: string;
		actor: string;
		approvalNotes: string;
	}) => Promise<SourceReview>;
	reject: (id: string, reason?: string) => Promise<SourceReview>;
	/** Defaults to process.env. CI and agent variables block apply. */
	env?: Readonly<Record<string, string | undefined>>;
	/** Defaults to process.stdin.isTTY. A non-TTY cannot confirm. */
	stdinIsTTY?: boolean;
	/**
	 * Human confirmation. The script prompts on a terminal and returns true
	 * only when the typed name matches. There is no environment bypass.
	 */
	confirmReviewer?: (reviewer: string) => Promise<boolean>;
	runner?: SignalCommandRunner;
}

export interface SignalSourceReviewResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export function formatSignalInstant(value: string | undefined): string {
	if (!value) return "not recorded";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "unreadable";
	return date.toLocaleString("en-AU", SYDNEY_INSTANT);
}

export function currentSignalRunner(now = new Date()): SignalCommandRunner {
	let user = "unknown";
	try {
		user = os.userInfo().username || "unknown";
	} catch {
		user = "unknown";
	}
	return {
		user,
		host: os.hostname() || "unknown",
		at: now.toISOString(),
	};
}

export function runnerRecord(runner: SignalCommandRunner): string {
	return `Ran by ${runner.user}@${runner.host} at ${formatSignalInstant(runner.at)} (${runner.at}).`;
}

/**
 * Why apply must stop before a human is asked. CI and agent sessions are
 * refused even when stdin looks like a terminal. An empty result means a
 * terminal prompt is allowed.
 */
export function signalApplyBlockReason(input: {
	env: Readonly<Record<string, string | undefined>>;
	stdinIsTTY: boolean;
}): string | undefined {
	if (input.env.CI || input.env.GITHUB_ACTIONS) {
		return "apply refuses to run in CI. A human confirms the reviewer name at a terminal, and CI cannot.";
	}
	if (input.env.CURSOR_AGENT || input.env.CLAUDECODE || input.env.CLAUDE_CODE) {
		return "apply refuses to run in an agent session. A human confirms the reviewer name at a terminal.";
	}
	if (!input.stdinIsTTY) {
		return "apply refuses a non-interactive session. A human confirms the reviewer name by typing it at a terminal.";
	}
	return undefined;
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function summaryLine(summary: string): string {
	const line = oneLine(summary);
	if (!line) return "none";
	if (line.length <= SIGNAL_CARD_SUMMARY_LIMIT) return line;
	return `${line.slice(0, SIGNAL_CARD_SUMMARY_LIMIT - 1)}…`;
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
	lines.push(
		`change: ${changeLine(review)}`,
		`summary: ${summaryLine(review.analysis.summary)}`,
		`relevance: ${Number.isFinite(review.analysis.relevanceScore) ? review.analysis.relevanceScore : "none"}`,
		`discovered: ${formatSignalInstant(review.discoveredAt)}`,
		`retrieved: ${formatSignalInstant(review.sourceEvidence.retrievedAt)}`,
	);
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

	const blocked = signalApplyBlockReason({
		env: deps.env ?? process.env,
		stdinIsTTY: deps.stdinIsTTY ?? Boolean(process.stdin.isTTY),
	});
	if (blocked) {
		return { exitCode: 1, stdout: "", stderr: blocked };
	}
	const confirmed = deps.confirmReviewer
		? await deps.confirmReviewer(reviewer)
		: false;
	if (!confirmed) {
		return {
			exitCode: 1,
			stdout: "",
			stderr:
				"A human must type the reviewer name at the terminal before apply runs.",
		};
	}

	const runner = deps.runner ?? currentSignalRunner();
	const attestation = runnerRecord(runner);
	try {
		if (action === "approve") {
			const review = await deps.approve({
				id,
				actor: reviewer,
				approvalNotes: attestation,
			});
			return {
				exitCode: 0,
				stdout: `Approved ${review.id} (status ${review.status}). ${attestation}`,
				stderr: "",
			};
		}
		const review = await deps.reject(
			id,
			`Dismissed by ${reviewer}. ${attestation}`,
		);
		return {
			exitCode: 0,
			stdout: `Dismissed ${review.id} (status ${review.status}). ${attestation}`,
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
