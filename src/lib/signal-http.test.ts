/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import type { PolicyDraft, SourceReview } from "@/types";
import {
	applySignalHttpDecision,
	formatSignalAttestation,
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
	replyText: "dismiss source-review-1",
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
		expect(text).toContain("Daniel Alkurdi (Signal): dismiss source-review-1");
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
	it("says approval happens elsewhere and flags tracked-record dismiss", () => {
		const fresh = previewSignalReview(review());
		expect(fresh.ok).toBe(true);
		if (!fresh.ok) return;
		expect(fresh.approve).toEqual({
			allowed: false,
			reason: expect.stringContaining("decision card"),
		});
		expect(fresh.dismiss.allowed).toBe(true);

		const tracked = previewSignalReview(
			review({ targetPolicyId: "federal-example" }),
		);
		expect(tracked.ok).toBe(true);
		if (!tracked.ok) return;
		expect(tracked.dismiss.allowed).toBe(false);
		expect(tracked.dismiss.blockers[0]).toMatch(/cannot be dismissed/);
	});
});

const dismiss = (
	found: SourceReview | null,
	reject = vi.fn(),
	action = "dismiss",
) =>
	applySignalHttpDecision(
		{
			reviewId: "source-review-1",
			action,
			reviewer: SIGNAL_HTTP_REVIEWER_DEFAULT,
			attestation: ATTESTATION,
		},
		{ getReview: async () => found, reject, env: {} },
	);

describe("signal HTTP apply", () => {
	it("refuses approve and points to the decision card", async () => {
		const reject = vi.fn();

		const result = await dismiss(review(), reject, "approve");

		expect(result).toMatchObject({
			ok: false,
			status: 403,
			code: "approve_not_allowed",
		});
		if (result.ok) return;
		expect(result.error).toContain("decision card");
		expect(reject).not.toHaveBeenCalled();
	});

	it("dismisses a new-source review with the Signal attestation", async () => {
		const reject = vi.fn().mockResolvedValue(review({ status: "rejected" }));

		const result = await dismiss(review(), reject);

		expect(result).toMatchObject({ ok: true, noop: false, action: "dismiss" });
		expect(reject).toHaveBeenCalledWith(
			"source-review-1",
			expect.stringContaining("relayed by Policai Signal"),
		);
	});

	it("blocks dismiss of a tracked-record review", async () => {
		const reject = vi.fn();

		const result = await dismiss(review({ targetPolicyId: "federal-example" }), reject);

		expect(result).toMatchObject({ ok: false, code: "dismiss_blocked" });
		expect(reject).not.toHaveBeenCalled();
	});

	it("dismisses idempotently when already rejected", async () => {
		const reject = vi.fn();

		const result = await dismiss(review({ status: "rejected" }), reject);

		expect(result).toMatchObject({ ok: true, noop: true, action: "dismiss" });
		expect(reject).not.toHaveBeenCalled();
	});
});
