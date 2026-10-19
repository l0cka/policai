import os from "node:os";
import type { Policy, PolicyDraft, SourceReview, TimelineEventDraft } from "@/types";
import { getJurisdictionName, getPolicyTypeName } from "@/types";

/**
 * Read-only cards for pending source reviews, and the apply command that
 * calls approve, dismiss, publish, and verify. The product path is Policai
 * Signal (Grok Bot) via MCP or a token-gated apply on a trusted host. The
 * TTY confirm path remains a fallback for approve/dismiss only.
 */

/** One-line analysis summary, including the ellipsis when truncated. */
export const SIGNAL_CARD_SUMMARY_LIMIT = 160;

/** Default allowlisted Signal reviewer when POLICAI_SIGNAL_REVIEWERS is unset. */
export const DEFAULT_SIGNAL_REVIEWERS = ["Daniel"] as const;

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

export type SignalApplyAction = "approve" | "dismiss" | "publish" | "verify";

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
	publish: (id: string) => Promise<SourceReview>;
	verify: (input: {
		policyId: string;
		actor: string;
		notes: string;
	}) => Promise<Policy>;
	/** Defaults to process.env. CI and agent variables block apply. */
	env?: Readonly<Record<string, string | undefined>>;
	/** Defaults to process.stdin.isTTY. A non-TTY cannot confirm on the TTY path. */
	stdinIsTTY?: boolean;
	/**
	 * Human confirmation for the TTY fallback. The script prompts on a
	 * terminal and returns true only when the typed name matches. There is
	 * no environment bypass for that path.
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

export function signalReviewers(
	env: Readonly<Record<string, string | undefined>>,
): string[] {
	const raw = env.POLICAI_SIGNAL_REVIEWERS?.trim();
	if (!raw) return [...DEFAULT_SIGNAL_REVIEWERS];
	const names = raw
		.split(",")
		.map((name) => name.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	return names.length > 0 ? names : [...DEFAULT_SIGNAL_REVIEWERS];
}

export function isSignalReviewer(
	reviewer: string,
	env: Readonly<Record<string, string | undefined>>,
): boolean {
	const name = reviewer.replace(/\s+/g, " ").trim();
	return signalReviewers(env).some(
		(allowed) => allowed.localeCompare(name, "en-AU", { sensitivity: "accent" }) === 0,
	);
}

/**
 * True when the caller presented the configured MCP admin token. Used for the
 * trusted Signal apply path (Grok Bot / Argus), not for the TTY fallback.
 */
export function isTrustedSignalApply(input: {
	env: Readonly<Record<string, string | undefined>>;
	adminToken?: string;
}): boolean {
	const expected = input.env.POLICAI_MCP_ADMIN_TOKEN;
	if (!expected || !input.adminToken) return false;
	return input.adminToken === expected;
}

/**
 * Why apply must stop. CI is always refused. The TTY fallback also refuses
 * agent sessions and non-interactive shells. The trusted token path allows
 * non-TTY hosts for the Grok Bot but still refuses Cursor/Claude agent
 * sessions and CI so a leaked token in a cloud agent cannot stamp through
 * this CLI.
 */
export function signalApplyBlockReason(input: {
	env: Readonly<Record<string, string | undefined>>;
	stdinIsTTY: boolean;
	trusted: boolean;
}): string | undefined {
	if (input.env.CI || input.env.GITHUB_ACTIONS) {
		return "apply refuses to run in CI. Signal writes require a trusted host or a human terminal, and CI cannot.";
	}
	if (input.env.CURSOR_AGENT || input.env.CLAUDECODE || input.env.CLAUDE_CODE) {
		return "apply refuses to run in an agent session. Policai Signal (Grok Bot) or a human terminal must apply the decision.";
	}
	if (input.trusted) return undefined;
	if (!input.stdinIsTTY) {
		return "apply refuses a non-interactive session without a matching POLICAI_MCP_ADMIN_TOKEN. Pass --admin-token on a trusted host, or confirm the reviewer name at a terminal.";
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

const USAGE =
	"Usage: signal:reviews [apply --action=approve|dismiss|publish|verify --id=<id> --reviewer=<name> [--admin-token=<token>]]";

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
			stderr: USAGE,
		};
	}

	const action = argument(argv, "action") as SignalApplyAction | undefined;
	const id = argument(argv, "id")?.trim();
	const reviewer = reviewerName(argument(argv, "reviewer"));
	const adminToken = argument(argv, "admin-token");
	const env = deps.env ?? process.env;
	const trusted = isTrustedSignalApply({ env, adminToken });

	if (
		action !== "approve" &&
		action !== "dismiss" &&
		action !== "publish" &&
		action !== "verify"
	) {
		return {
			exitCode: 2,
			stdout: "",
			stderr: "Action must be approve, dismiss, publish, or verify.",
		};
	}
	if (!id) {
		return {
			exitCode: 2,
			stdout: "",
			stderr:
				action === "verify"
					? "A register policy id is required."
					: "A source review id is required.",
		};
	}

	if (action === "publish" || action === "verify") {
		if (!trusted) {
			return {
				exitCode: 1,
				stdout: "",
				stderr:
					"publish and verify require a matching --admin-token (POLICAI_MCP_ADMIN_TOKEN) on a trusted Signal host.",
			};
		}
	}

	if (action !== "publish") {
		if (!reviewer) {
			return {
				exitCode: 1,
				stdout: "",
				stderr: "A human reviewer identity is required.",
			};
		}
		if (trusted && !isSignalReviewer(reviewer, env)) {
			return {
				exitCode: 1,
				stdout: "",
				stderr: `Signal reviewer must be one of: ${signalReviewers(env).join(", ")}.`,
			};
		}
	}

	const blocked = signalApplyBlockReason({
		env,
		stdinIsTTY: deps.stdinIsTTY ?? Boolean(process.stdin.isTTY),
		trusted,
	});
	if (blocked) {
		return { exitCode: 1, stdout: "", stderr: blocked };
	}

	if (!trusted) {
		const confirmed = deps.confirmReviewer
			? await deps.confirmReviewer(reviewer as string)
			: false;
		if (!confirmed) {
			return {
				exitCode: 1,
				stdout: "",
				stderr:
					"A human must type the reviewer name at the terminal before apply runs, or pass a matching --admin-token on a trusted Signal host.",
			};
		}
	}

	const runner = deps.runner ?? currentSignalRunner();
	const attestation = runnerRecord(runner);
	const pathNote = trusted
		? `Signal trusted apply. ${attestation}`
		: attestation;

	try {
		if (action === "approve") {
			const review = await deps.approve({
				id,
				actor: reviewer as string,
				approvalNotes: pathNote,
			});
			return {
				exitCode: 0,
				stdout: `Approved ${review.id} (status ${review.status}). ${pathNote}`,
				stderr: "",
			};
		}
		if (action === "dismiss") {
			const review = await deps.reject(
				id,
				`Dismissed by ${reviewer}. ${pathNote}`,
			);
			return {
				exitCode: 0,
				stdout: `Dismissed ${review.id} (status ${review.status}). ${pathNote}`,
				stderr: "",
			};
		}
		if (action === "publish") {
			const review = await deps.publish(id);
			return {
				exitCode: 0,
				stdout: `Published ${review.id} (status ${review.status}). ${pathNote}`,
				stderr: "",
			};
		}
		const policy = await deps.verify({
			policyId: id,
			actor: reviewer as string,
			notes: pathNote,
		});
		return {
			exitCode: 0,
			stdout: `Verified ${policy.id} (verification ${policy.verification.status}). ${pathNote}`,
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
