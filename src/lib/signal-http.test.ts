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
