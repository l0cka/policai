/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import type { PolicyDraft, SourceReview } from "@/types";
import {
	applySignalHttpDecision,
	formatSignalAttestation,
	parseReplyOverrides,
	previewSignalReview,
	requireSignalHttpToken,
	SIGNAL_HTTP_REVIEWER_DEFAULT,
} from "./signal-http";

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
		themes: ["ai-governance", "generative-ai"],
		dates: [
			{ type: "published", date: "2026-07-01", precision: "day", primary: true },
		],
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

const ATTESTATION = {
	replyText: "approve source-review-1",
	chatMessageId: "msg-99",
	cardId: "source-review-1",
	decidedAt: "2026-10-19T05:00:00.000Z",
};

describe("signal HTTP attestation", () => {
	it("formats Sydney time and never claims TTY typing", () => {
		const text = formatSignalAttestation(
			ATTESTATION,
			SIGNAL_HTTP_REVIEWER_DEFAULT,
		);
		expect(text).toContain("Daniel Alkurdi (Signal): approve source-review-1");
		expect(text).toContain("chatMessageId: msg-99");
		expect(text).toContain("cardId: source-review-1");
		expect(text).toContain("relayed by Policai Signal");
		expect(text).not.toMatch(/TTY|terminal|Type .+ to confirm/i);
	});
});

describe("signal HTTP auth", () => {
	it("refuses when the host token is missing or wrong", () => {
		expect(requireSignalHttpToken("x", {})).toMatchObject({
			ok: false,
			code: "signal_token_unconfigured",
		});
		expect(
			requireSignalHttpToken("wrong", { POLICAI_SIGNAL_TOKEN: "secret" }),
		).toMatchObject({ ok: false, status: 401 });
		expect(
			requireSignalHttpToken("secret", { POLICAI_SIGNAL_TOKEN: "secret" }),
		).toEqual({ ok: true });
	});
});

describe("signal HTTP dry-run preview", () => {
	it("flags missing themes and tracked-record dismiss", () => {
		const noThemes = previewSignalReview(
			review({ proposedRecord: draft({ themes: [] }) }),
		);
		expect(noThemes.ok).toBe(true);
		if (!noThemes.ok) return;
		expect(noThemes.approve.allowed).toBe(false);
		expect(noThemes.approve.blockers[0]).toMatch(/no themes/);

		const tracked = previewSignalReview(
			review({ targetPolicyId: "federal-example" }),
		);
		expect(tracked.ok).toBe(true);
		if (!tracked.ok) return;
		expect(tracked.dismiss.allowed).toBe(false);
		expect(tracked.dismiss.blockers[0]).toMatch(/cannot be dismissed/);
	});
});

describe("signal HTTP apply", () => {
	it("approves then publishes with attestation", async () => {
		const approve = vi.fn().mockResolvedValue(
			review({ status: "approved", reviewedBy: SIGNAL_HTTP_REVIEWER_DEFAULT }),
		);
		const publish = vi.fn().mockResolvedValue(
			review({ status: "published", publishedAt: "2026-10-19T05:01:00.000Z" }),
		);
		const reject = vi.fn();

		const result = await applySignalHttpDecision(
			{
				reviewId: "source-review-1",
				action: "approve",
				reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
				attestation: ATTESTATION,
			},
			{
				getReview: async () => review(),
				approve,
				publish,
				reject,
				env: {},
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.noop).toBe(false);
		expect(approve).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "source-review-1",
				actor: SIGNAL_HTTP_REVIEWER_DEFAULT,
			}),
		);
		expect(approve.mock.calls[0][0].approvalNotes).toContain(
			"relayed by Policai Signal",
		);
		expect(publish).toHaveBeenCalledWith("source-review-1");
		expect(reject).not.toHaveBeenCalled();
	});

	it("is a no-op when the review is already published", async () => {
		const approve = vi.fn();
		const publish = vi.fn();
		const result = await applySignalHttpDecision(
			{
				reviewId: "source-review-1",
				action: "approve",
				reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
				attestation: ATTESTATION,
			},
			{
				getReview: async () => review({ status: "published" }),
				approve,
				publish,
				reject: vi.fn(),
				env: {},
			},
		);
		expect(result).toMatchObject({ ok: true, noop: true });
		expect(approve).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
	});

	it("returns themes_required without inventing themes", async () => {
		const result = await applySignalHttpDecision(
			{
				reviewId: "source-review-1",
				action: "approve",
				reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
				attestation: ATTESTATION,
			},
			{
				getReview: async () =>
					review({ proposedRecord: draft({ themes: [] }) }),
				approve: vi.fn(),
				publish: vi.fn(),
				reject: vi.fn(),
				env: {},
			},
		);
		expect(result).toMatchObject({
			ok: false,
			code: "approve_blocked",
		});
		if (result.ok) return;
		expect(result.error).toMatch(/must not invent themes/);
	});

	it("blocks dismiss of a tracked-record review", async () => {
		const result = await applySignalHttpDecision(
			{
				reviewId: "source-review-1",
				action: "dismiss",
				reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
				attestation: ATTESTATION,
			},
			{
				getReview: async () =>
					review({ targetPolicyId: "federal-example" }),
				approve: vi.fn(),
				publish: vi.fn(),
				reject: vi.fn(),
				env: {},
			},
		);
		expect(result).toMatchObject({
			ok: false,
			code: "dismiss_blocked",
		});
	});

	it("dismisses a new-source review idempotently when already rejected", async () => {
		const reject = vi.fn();
		const result = await applySignalHttpDecision(
			{
				reviewId: "source-review-1",
				action: "dismiss",
				reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
				attestation: ATTESTATION,
			},
			{
				getReview: async () => review({ status: "rejected" }),
				approve: vi.fn(),
				publish: vi.fn(),
				reject,
				env: {},
			},
		);
		expect(result).toMatchObject({ ok: true, noop: true, action: "dismiss" });
		expect(reject).not.toHaveBeenCalled();
	});
});

describe("signal reply overrides", () => {
	const themeless = () => review({ proposedRecord: draft({ themes: [] }) });

	it.each([
		["themes public-sector, ai-governance", "public-sector", true],
		["themes public-sector, ai-governance", "ai-governance", true],
		["themes genai-governance-x", "ai-governance", false],
		["themes ai-governance-x", "ai-governance", false],
		["themes xai-governance", "ai-governance", false],
		["Approve. Themes: AI-Governance.", "ai-governance", true],
		["theme (public-sector)", "public-sector", true],
		["themes public sector", "public-sector", false],
		["public-sector", "public-sector", false],
		["approve public-sector ai-governance", "public-sector", false],
		["themes ai-governance. Also public-sector", "public-sector", false],
		["themes ai-governance; public-sector", "public-sector", false],
		["themes ai-governance type public-sector", "public-sector", false],
		["employment law is fine; themes ai-governance", "employment", false],
		["type practice_note please", "practice_note", true],
		["Type: practice_note", "practice_note", true],
		["type practice_notes", "practice_note", false],
		["approve this practice_note", "practice_note", false],
		["type is practice_note", "practice_note", false],
		["approve this policy", "policy", false],
		["approve this policy, type legislation", "policy", false],
		["approve this policy, type legislation", "legislation", true],
		["themes ai-governance, type legislation", "legislation", true],
	])("reply %j names %s: %s", (replyText, value, named) => {
		const isType = ["practice_note", "policy", "legislation"].includes(value);
		const result = parseReplyOverrides(
			isType ? { type: value, replyText } : { themes: [value], replyText },
			themeless(),
		);
		expect(result.ok).toBe(named);
		if (!result.ok) {
			expect(result.code).toBe(
				isType ? "type_not_in_reply" : "themes_not_in_reply",
			);
			expect(result.error).toContain(value);
		}
	});

	it.each([
		[
			{ themes: ["made-up"] },
			"unknown_theme",
			/"made-up".*valid theme ids are .*ai-governance/,
		],
		[{ themes: [42] }, "unknown_theme", /42/],
		[{ themes: "ai-governance" }, "invalid_request", /array/],
		[{ themes: [] }, "invalid_request", /1 to 5/],
		[
			{
				themes: [
					"ai-governance",
					"public-sector",
					"generative-ai",
					"privacy-data",
					"standards",
					"employment",
				],
			},
			"invalid_request",
			/1 to 5/,
		],
		[
			{ themes: ["ai-governance", "ai-governance"] },
			"invalid_request",
			/repeat/,
		],
		[{ type: "bill" }, "unknown_type", /"bill".*legislation/],
		[{ type: 3 }, "unknown_type", /3/],
	])("rejects %j with %s", (overrides, code, message) => {
		const result = parseReplyOverrides(
			{
				...overrides,
				replyText:
					"approve ai-governance public-sector generative-ai privacy-data standards employment bill",
			},
			themeless(),
		);
		expect(result).toMatchObject({ ok: false, code });
		if (!result.ok) expect(result.error).toMatch(message);
	});

	it("names every missing theme", () => {
		const result = parseReplyOverrides(
			{
				themes: ["ai-governance", "public-sector", "privacy-data"],
				replyText: "approve, themes ai-governance",
			},
			themeless(),
		);
		expect(result).toMatchObject({ ok: false, code: "themes_not_in_reply" });
		if (!result.ok) {
			expect(result.error).toContain("themes: public-sector, privacy-data.");
		}
	});

	it("refuses overrides on timeline and tracked-record reviews", () => {
		const input = { themes: ["ai-governance"], replyText: "ai-governance" };
		expect(
			parseReplyOverrides(input, review({ entryKind: "timeline_event" })),
		).toMatchObject({ ok: false, code: "invalid_request" });
		expect(
			parseReplyOverrides(input, review({ targetPolicyId: "federal-example" })),
		).toMatchObject({ ok: false, code: "invalid_request" });
	});

	it("returns no overrides when none are sent", () => {
		expect(parseReplyOverrides({ replyText: "approve" }, themeless())).toEqual({
			ok: true,
			overrides: {},
		});
	});
});

describe("signal HTTP apply with reply overrides", () => {
	const overrideAttestation = {
		...ATTESTATION,
		replyText: "approve, themes public-sector and ai-governance, type guideline",
	};

	function fakeDeps(current: SourceReview) {
		return {
			getReview: async () => current,
			approve: vi.fn().mockResolvedValue(review({ status: "approved" })),
			publish: vi.fn().mockResolvedValue(review({ status: "published" })),
			reject: vi.fn(),
			env: {},
		};
	}

	function decide(
		action: "approve" | "dismiss",
		extra: { themes?: unknown; type?: unknown },
		attestation = overrideAttestation,
	) {
		return {
			reviewId: "source-review-1",
			action,
			reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
			attestation,
			...extra,
		};
	}

	it("approves a themeless draft with the themes and type Daniel named", async () => {
		const deps = fakeDeps(review({ proposedRecord: draft({ themes: [] }) }));
		const result = await applySignalHttpDecision(
			decide("approve", {
				themes: ["public-sector", "ai-governance"],
				type: "guideline",
			}),
			deps,
		);
		expect(result).toMatchObject({ ok: true, noop: false });
		const call = deps.approve.mock.calls[0][0];
		expect(call.proposedRecord).toEqual(
			draft({ themes: ["public-sector", "ai-governance"], type: "guideline" }),
		);
		expect(call.approvalNotes).toContain(
			"themes: public-sector, ai-governance\ntype: guideline\nrelayed by Policai Signal",
		);
		if (result.ok) expect(result.attestationText).toBe(call.approvalNotes);
		expect(deps.publish).toHaveBeenCalledWith("source-review-1");
	});

	it("replaces existing themes rather than merging", async () => {
		const deps = fakeDeps(review());
		await applySignalHttpDecision(
			decide("approve", { themes: ["public-sector"] }),
			deps,
		);
		expect(deps.approve.mock.calls[0][0].proposedRecord.themes).toEqual([
			"public-sector",
		]);
	});

	it("refuses invented themes before approving", async () => {
		const deps = fakeDeps(review({ proposedRecord: draft({ themes: [] }) }));
		const result = await applySignalHttpDecision(
			decide("approve", { themes: ["public-sector", "privacy-data"] }),
			deps,
		);
		expect(result).toMatchObject({
			ok: false,
			status: 400,
			code: "themes_not_in_reply",
		});
		expect(deps.approve).not.toHaveBeenCalled();
		expect(deps.publish).not.toHaveBeenCalled();
	});

	it("refuses overrides on dismiss", async () => {
		const deps = fakeDeps(review());
		const result = await applySignalHttpDecision(
			decide("dismiss", { type: "guideline" }),
			deps,
		);
		expect(result).toMatchObject({
			ok: false,
			status: 400,
			code: "invalid_request",
		});
		expect(deps.reject).not.toHaveBeenCalled();
	});

	it("stays a no-op on a published review whatever the overrides", async () => {
		const deps = fakeDeps(review({ status: "published" }));
		const result = await applySignalHttpDecision(
			decide("approve", { themes: ["not-a-theme"], type: "bill" }, ATTESTATION),
			deps,
		);
		expect(result).toMatchObject({ ok: true, noop: true });
		expect(deps.approve).not.toHaveBeenCalled();
		expect(deps.publish).not.toHaveBeenCalled();
	});

	it("blocks a draft with no primary date even when themes are supplied", async () => {
		const deps = fakeDeps(
			review({ proposedRecord: draft({ themes: [], dates: undefined }) }),
		);
		const result = await applySignalHttpDecision(
			decide("approve", { themes: ["public-sector"] }),
			deps,
		);
		expect(result).toMatchObject({ ok: false, code: "approve_blocked" });
		if (!result.ok) {
			expect(result.error).toMatch(/no primary date/);
			expect(result.error).not.toMatch(/no themes/);
		}
		expect(deps.approve).not.toHaveBeenCalled();
	});
});

describe("signal HTTP dry-run override options", () => {
	it("lists theme and type options for a new policy draft", () => {
		const preview = previewSignalReview(
			review({ proposedRecord: draft({ themes: [] }) }),
		);
		if (!preview.ok) throw new Error("preview failed");
		expect(preview.review).toMatchObject({ themes: [], type: "policy" });
		expect(preview.approve.themeOptions).toContainEqual({
			id: "public-sector",
			label: "Public sector use",
		});
		expect(preview.approve.typeOptions).toContain("legislation");
		expect(preview.approve.blockers[0]).toMatch(
			/Ask Daniel to name 1 to 5 themes/,
		);
	});

	it("offers no options where overrides are refused", () => {
		const preview = previewSignalReview(
			review({ targetPolicyId: "federal-example" }),
		);
		if (!preview.ok) throw new Error("preview failed");
		expect(preview.approve.themeOptions).toEqual([]);
		expect(preview.approve.typeOptions).toEqual([]);
	});
});
