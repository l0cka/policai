/* @vitest-environment node */

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PolicyDraft, SourceReview } from "@/types";
import {
	formatPendingSourceReviewCards,
	formatSignalInstant,
	runSignalSourceReviewCommand,
	SIGNAL_CARD_SUMMARY_LIMIT,
	type SignalSourceReviewDeps,
} from "./signal-source-reviews";

const URL = "https://example.gov.au/ai-policy";

function draft(overrides: Partial<PolicyDraft> = {}): PolicyDraft {
	return {
		id: "draft-policy",
		title: "Draft AI policy",
		description: "A source-backed policy description.",
		jurisdiction: "federal",
		type: "policy",
		status: "active",
		agencies: [],
		sourceUrl: URL,
		content: "Key policy details.",
		aiSummary: "Machine-assisted summary.",
		tags: [],
		themes: [],
		createdAt: "2026-07-16T00:00:00.000Z",
		updatedAt: "2026-07-16T00:00:00.000Z",
		...overrides,
	};
}

function review(overrides: Partial<SourceReview> = {}): SourceReview {
	return {
		id: "source-review-1",
		sourceUrl: URL,
		title: "Draft AI policy",
		entryKind: "policy",
		status: "pending_review",
		discoveredAt: "2026-07-16T00:00:00.000Z",
		createdBy: "collector",
		analysis: {
			isRelevant: true,
			relevanceScore: 0.65,
			suggestedType: "policy",
			suggestedJurisdiction: "federal",
			summary: "A source-backed policy description.",
		},
		sourceEvidence: {
			url: URL,
			retrievedAt: "2026-07-16T00:00:00.000Z",
			contentHash: "a".repeat(64),
		},
		proposedRecord: draft(),
		updatedAt: "2026-07-16T00:00:00.000Z",
		...overrides,
	};
}

const RUNNER = {
	user: "daniel",
	host: "argus",
	at: "2026-10-19T00:00:00.000Z",
};
const ATTESTATION =
	"Ran by daniel@argus at 19 Oct 2026, 11:00 AEDT (2026-10-19T00:00:00.000Z).";

function deps(
	overrides: Partial<SignalSourceReviewDeps> = {},
): SignalSourceReviewDeps {
	return {
		listPending: vi.fn().mockResolvedValue([]),
		reject: vi.fn(),
		verify: vi.fn(),
		env: {},
		stdinIsTTY: true,
		confirmReviewer: async () => true,
		runner: RUNNER,
		...overrides,
	};
}

const TRUSTED_ENV = {
	POLICAI_MCP_ADMIN_TOKEN: "signal-secret",
} as const;

describe("pending source review cards", () => {
	it("prints one card per pending review and a count footer", () => {
		const text = formatPendingSourceReviewCards([
			review({
				id: "older",
				discoveredAt: "2026-07-01T00:00:00.000Z",
				title: "Older\npolicy",
			}),
			review({
				id: "newer",
				discoveredAt: "2026-07-20T00:00:00.000Z",
				title: "Newer policy",
				sourceUrl: "https://www.health.qld.gov.au/ai",
				analysis: {
					isRelevant: true,
					relevanceScore: 0.5,
					suggestedType: "guideline",
					suggestedJurisdiction: "federal",
					summary: "Ignored when the draft has a jurisdiction.",
				},
				proposedRecord: draft({
					jurisdiction: "qld",
					type: "guideline",
				}),
			}),
			review({ id: "approved", status: "approved" }),
			review({ id: "published", status: "published" }),
			review({ id: "rejected", status: "rejected" }),
		]);

		expect(text).toBe(
			[
				"id: newer",
				"title: Newer policy",
				"url: https://www.health.qld.gov.au/ai",
				"jurisdiction: Queensland",
				"change: Would add a new guideline record.",
				"summary: Ignored when the draft has a jurisdiction.",
				"relevance: 0.5",
				"discovered: 20 July 2026, 10:00 AEST",
				"retrieved: 16 July 2026, 10:00 AEST",
				"",
				"id: older",
				"title: Older policy",
				"url: https://example.gov.au/ai-policy",
				"jurisdiction: Federal",
				"change: Would add a new policy record.",
				"summary: A source-backed policy description.",
				"relevance: 0.65",
				"discovered: 01 July 2026, 10:00 AEST",
				"retrieved: 16 July 2026, 10:00 AEST",
				"",
				"2 pending source reviews.",
			].join("\n"),
		);
	});

	it("uses a singular footer for one review", () => {
		expect(formatPendingSourceReviewCards([review()])).toMatch(
			/1 pending source review\.$/,
		);
	});

	it("omits jurisdiction when the review has none and uses analysis otherwise", () => {
		const withoutJurisdiction = {
			...draft(),
			jurisdiction: undefined,
		} as unknown as PolicyDraft;
		const text = formatPendingSourceReviewCards([
			review({
				analysis: {
					isRelevant: true,
					relevanceScore: 0.5,
					suggestedType: null,
					suggestedJurisdiction: null,
					summary: "No jurisdiction.",
				},
				proposedRecord: withoutJurisdiction,
			}),
		]);

		expect(text).not.toContain("jurisdiction:");
		expect(text).toContain(`url: ${URL}`);

		const fromAnalysis = formatPendingSourceReviewCards([
			review({
				analysis: {
					isRelevant: true,
					relevanceScore: 0.5,
					suggestedType: "policy",
					suggestedJurisdiction: "nsw",
					summary: "State policy.",
				},
				proposedRecord: withoutJurisdiction,
			}),
		]);
		expect(fromAnalysis).toContain("jurisdiction: New South Wales");
	});

	it("states the register or timeline change in one line", () => {
		expect(
			formatPendingSourceReviewCards([
				review({ targetPolicyId: "national-ai-plan" }),
			]),
		).toContain(
			"change: Would update register record national-ai-plan in place.",
		);
		expect(
			formatPendingSourceReviewCards([
				review({
					targetPolicyId: "national-ai-plan",
					targetPolicyPreviousSourceUrl: "https://example.gov.au/old",
				}),
			]),
		).toContain(
			"change: Would replace the source URL of register record national-ai-plan.",
		);
		expect(
			formatPendingSourceReviewCards([
				review({
					entryKind: "timeline_event",
					targetTimelineEventId: "event-1",
				}),
			]),
		).toContain("change: Would update timeline event event-1 in place.");
		expect(
			formatPendingSourceReviewCards([
				review({
					entryKind: "timeline_event",
					targetTimelineEventId: "event-1",
					targetTimelineEventPreviousSourceUrl:
						"https://example.gov.au/old-event",
				}),
			]),
		).toContain(
			"change: Would replace the source URL of timeline event event-1.",
		);
		expect(
			formatPendingSourceReviewCards([
				review({ entryKind: "timeline_event" }),
			]),
		).toContain("change: Would add a timeline event.");
	});

	it("truncates the analysis summary to one line", () => {
		const summary = `Sentence. ${"word ".repeat(80)}`;
		const text = formatPendingSourceReviewCards([
			review({
				analysis: {
					...review().analysis,
					summary,
				},
			}),
		]);
		const line = text.split("\n").find((row) => row.startsWith("summary: "));
		expect(line).toBeDefined();
		expect(line!.length).toBe("summary: ".length + SIGNAL_CARD_SUMMARY_LIMIT);
		expect(line).toMatch(/…$/);
		expect(line).not.toContain("\n");
	});

	it("is an empty state when nothing is pending", () => {
		expect(formatPendingSourceReviewCards([])).toBe(
			"No pending source reviews.",
		);
		expect(
			formatPendingSourceReviewCards([
				review({ status: "approved" }),
			]),
		).toBe("No pending source reviews.");
	});
});

describe("signal source review apply", () => {
	it.each(["approve", "publish"])(
		"refuses %s and points to decision cards",
		async (action) => {
			const reject = vi.fn();
			const verify = vi.fn();
			const result = await runSignalSourceReviewCommand(
				[
					"apply",
					`--action=${action}`,
					"--id=rev-1",
					"--reviewer=Daniel",
					"--admin-token=signal-secret",
				],
				deps({ reject, verify, env: TRUSTED_ENV, stdinIsTTY: false }),
			);

			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain("decision cards");
			expect(reject).not.toHaveBeenCalled();
			expect(verify).not.toHaveBeenCalled();
		},
	);

	it("refuses apply without a human confirmation", async () => {
		const reject = vi.fn();
		const result = await runSignalSourceReviewCommand(
			["apply", "--action=dismiss", "--id=rev-1", "--reviewer=Daniel"],
			deps({
				reject,
				confirmReviewer: async () => false,
			}),
		);

		expect(result).toMatchObject({
			exitCode: 1,
			stderr:
				"A human must type the reviewer name at the terminal before recovery apply runs, or pass a matching --admin-token. The Grok Bot product path is HTTPS /api/signal/reviews with POLICAI_SIGNAL_TOKEN.",
		});
		expect(reject).not.toHaveBeenCalled();
	});

	it.each([
		["non-interactive", {}, false],
		["CI", { CI: "true" }, true],
		["GitHub Actions", { GITHUB_ACTIONS: "true" }, true],
		["agent", { CURSOR_AGENT: "1" }, true],
	] as const)(
		"refuses apply in a %s session even if confirmation returns true",
		async (_label, env, stdinIsTTY) => {
			const reject = vi.fn();
			const result = await runSignalSourceReviewCommand(
				["apply", "--action=dismiss", "--id=rev-1", "--reviewer=Daniel"],
				deps({
					reject,
					env: { ...env },
					stdinIsTTY,
					confirmReviewer: async () => true,
				}),
			);

			expect(result.exitCode).toBe(1);
			expect(result.stderr.length).toBeGreaterThan(0);
			expect(reject).not.toHaveBeenCalled();
		},
	);

	it("dismisses on the trusted token path without a TTY confirm", async () => {
		const reject = vi.fn().mockResolvedValue(
			review({ id: "rev-1", status: "rejected" }),
		);
		const confirmReviewer = vi.fn().mockResolvedValue(false);
		const result = await runSignalSourceReviewCommand(
			[
				"apply",
				"--action=dismiss",
				"--id=rev-1",
				"--reviewer=Daniel",
				"--admin-token=signal-secret",
			],
			deps({
				reject,
				env: TRUSTED_ENV,
				stdinIsTTY: false,
				confirmReviewer,
			}),
		);

		expect(confirmReviewer).not.toHaveBeenCalled();
		expect(reject).toHaveBeenCalledWith(
			"rev-1",
			`Dismissed by Daniel. Signal recovery apply. ${ATTESTATION}`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Dismissed rev-1");
	});

	it("refuses a trusted apply when the reviewer is not allowlisted", async () => {
		const reject = vi.fn();
		const result = await runSignalSourceReviewCommand(
			[
				"apply",
				"--action=dismiss",
				"--id=rev-1",
				"--reviewer=NotDaniel",
				"--admin-token=signal-secret",
			],
			deps({ reject, env: TRUSTED_ENV, stdinIsTTY: false }),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Signal reviewer must be one of: Daniel Alkurdi, Daniel");
		expect(reject).not.toHaveBeenCalled();
	});

	it("verifies only on the trusted token path", async () => {
		const verify = vi.fn().mockResolvedValue({
			id: "federal-example",
			verification: { status: "verified" },
		});
		const denied = await runSignalSourceReviewCommand(
			["apply", "--action=verify", "--id=federal-example", "--reviewer=Daniel"],
			deps({ verify, stdinIsTTY: true }),
		);
		expect(denied.exitCode).toBe(1);
		expect(denied.stderr).toMatch(/requires a matching --admin-token/);
		expect(verify).not.toHaveBeenCalled();

		const result = await runSignalSourceReviewCommand(
			[
				"apply",
				"--action=verify",
				"--id=federal-example",
				"--reviewer=Daniel",
				"--admin-token=signal-secret",
			],
			deps({ verify, env: TRUSTED_ENV, stdinIsTTY: false }),
		);

		expect(verify).toHaveBeenCalledWith({
			policyId: "federal-example",
			actor: "Daniel",
			notes: `Signal recovery apply. ${ATTESTATION}`,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Verified federal-example");
	});

	it("refuses trusted apply in a Cursor agent session even with a token", async () => {
		const verify = vi.fn();
		const result = await runSignalSourceReviewCommand(
			[
				"apply",
				"--action=verify",
				"--id=federal-example",
				"--reviewer=Daniel",
				"--admin-token=signal-secret",
			],
			deps({
				verify,
				env: { ...TRUSTED_ENV, CURSOR_AGENT: "1" },
				stdinIsTTY: false,
			}),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/agent session/);
		expect(verify).not.toHaveBeenCalled();
	});

	it("records the OS user, host, and timestamp on the dismissal", async () => {
		const reject = vi.fn().mockResolvedValue(
			review({ id: "rev-1", status: "rejected" }),
		);
		const result = await runSignalSourceReviewCommand(
			["apply", "--action=dismiss", "--id=rev-1", "--reviewer=Daniel"],
			deps({ reject, runner: undefined }),
		);

		expect(result.exitCode).toBe(0);
		const notes = reject.mock.calls[0][1] as string;
		expect(notes).toContain(
			`Ran by ${os.userInfo().username}@${os.hostname()} at `,
		);
		expect(notes).toMatch(/\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\)\.$/);
	});

	it("dismisses through the existing reject path", async () => {
		const reject = vi.fn().mockResolvedValue(
			review({ id: "rev-9", status: "rejected" }),
		);
		const result = await runSignalSourceReviewCommand(
			["apply", "--action=dismiss", "--id=rev-9", "--reviewer=Daniel"],
			deps({ reject }),
		);

		expect(reject).toHaveBeenCalledWith(
			"rev-9",
			`Dismissed by Daniel. ${ATTESTATION}`,
		);
		expect(result).toEqual({
			exitCode: 0,
			stdout: `Dismissed rev-9 (status rejected). ${ATTESTATION}`,
			stderr: "",
		});
	});

	it("returns the reject path's reason for a tracked record", async () => {
		const reject = vi.fn().mockRejectedValue(
			new Error(
				"Tracked-record reviews must be approved and published to re-verify the target; they cannot be rejected",
			),
		);
		const result = await runSignalSourceReviewCommand(
			["apply", "--action=dismiss", "--id=rev-2", "--reviewer=Ada"],
			deps({ reject }),
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/cannot be rejected/);
	});

	it("refuses when the reviewer name is missing", async () => {
		const reject = vi.fn();
		const result = await runSignalSourceReviewCommand(
			["apply", "--action=dismiss", "--id=rev-1", "--reviewer="],
			deps({ reject }),
		);

		expect(result).toMatchObject({
			exitCode: 1,
			stderr: "A human reviewer identity is required.",
		});
		expect(reject).not.toHaveBeenCalled();
	});

	it("prints fixture cards from list without deciding them", async () => {
		const listPending = vi.fn().mockResolvedValue([review()]);
		const reject = vi.fn();
		const result = await runSignalSourceReviewCommand([], deps({
			listPending,
			reject,
		}));

		expect(listPending).toHaveBeenCalledOnce();
		expect(reject).not.toHaveBeenCalled();
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("id: source-review-1");
		expect(result.stdout).toContain("1 pending source review.");
	});
});

describe("signal source review wiring", () => {
	it("wires dismiss and verify through the token-gated ladder, not a confirm bypass", () => {
		const lib = readFileSync(
			path.join(process.cwd(), "src/lib/signal-source-reviews.ts"),
			"utf8",
		);
		const script = readFileSync(
			path.join(process.cwd(), "scripts/signal-source-reviews.ts"),
			"utf8",
		);

		expect(script).not.toMatch(/approveStagedSource|publishStagedSource/);
		expect(script).toContain("rejectStagedSource(id, reason)");
		expect(script).toContain("verifyRegisterRecord({ policyId, actor, notes })");
		expect(script).toContain("confirmReviewer");
		expect(script).toContain("currentSignalRunner()");
		expect(lib).toContain("isTrustedSignalApply");
		expect(lib).toContain("POLICAI_MCP_ADMIN_TOKEN");
		expect(lib).toContain("DEFAULT_SIGNAL_REVIEWERS");
		expect(lib).not.toMatch(/POLICAI_SIGNAL_REVIEW_CONFIRM|process\.env\.[A-Z0-9_]*CONFIRM/);
		expect(lib).not.toContain("proposedRecord:");

		const workflow = readFileSync(
			path.join(process.cwd(), ".github/workflows/signal-review-cards.yml"),
			"utf8",
		);
		expect(workflow).toContain("contents: read");
		expect(workflow).not.toMatch(/contents:\s*write|pull-requests:\s*write/);
		expect(workflow).toContain("workflow_dispatch");
		expect(workflow).not.toContain("schedule:");
		expect(script).toContain('getSourceReviews({ status: "pending_review" })');
	});
});

describe("formatSignalInstant", () => {
	it("prints September as Sep, like the site", () => {
		const text = formatSignalInstant("2026-09-14T02:30:00Z");
		expect(text).toContain("14 Sep 2026");
		expect(text).not.toContain("Sept");
	});
});
