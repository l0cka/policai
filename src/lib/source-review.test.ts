/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import type { Development, SourceReview } from "@/types";
import {
	mergeSourceReviews,
	reconcileLinkedDevelopments,
} from "./source-review";

describe("source review recovery", () => {
	it("replaces an existing review snapshot with recovered collector evidence", () => {
		const existing = {
			id: "source-review-stable",
			status: "pending_review",
			sourceEvidence: { contentHash: "a".repeat(64) },
			proposedRecord: { title: "Preliminary title" },
		} as SourceReview;
		const recovered = {
			...existing,
			sourceEvidence: { contentHash: "b".repeat(64) },
			proposedRecord: { title: "Extracted official title" },
		} as SourceReview;
		const untouched = {
			id: "source-review-untouched",
			status: "approved",
		} as SourceReview;

		expect(
			mergeSourceReviews([existing, untouched], [recovered]),
		).toEqual([recovered, untouched]);
	});

	it("preserves first-discovery timestamps when enriching the same document transition", () => {
		const existing = {
			id: "source-review-stable-transition",
			sourceVersionSequence: 3,
			discoveredAt: "2026-07-15T00:00:00.000Z",
			sourceEvidence: { contentHash: "a".repeat(64) },
			linkedDevelopment: {
				id: "dev-stable-transition",
				detectedAt: "2026-07-15T00:00:00.000Z",
			},
		} as SourceReview;
		const enriched = {
			...existing,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			linkedDevelopment: {
				...existing.linkedDevelopment,
				detectedAt: "2026-07-16T00:00:00.000Z",
				summary: "Successfully extracted evidence.",
			},
		} as SourceReview;

		expect(mergeSourceReviews([existing], [enriched])).toEqual([
			{
				...enriched,
				discoveredAt: existing.discoveredAt,
				linkedDevelopment: {
					...enriched.linkedDevelopment,
					detectedAt: existing.linkedDevelopment?.detectedAt,
				},
			},
		]);
	});

	it("restores a development retained inside a staged review after a partial write", () => {
		const linkedDevelopment = {
			id: "dev-recover-me",
			title: "AI policy update",
			url: "https://example.gov.au/ai-policy",
			sourceId: "source",
			sourceName: "Source",
			jurisdiction: "federal",
			detectedAt: "2026-07-16T00:00:00.000Z",
			relevanceScore: 1,
			classification: "heuristic",
			assessment: {
				method: "heuristic",
				assessedAt: "2026-07-16T00:00:00.000Z",
				promptVersion: "test",
			},
			verification: {
				status: "needs_review",
				source: { url: "https://example.gov.au/ai-policy" },
			},
			status: "detected",
		} satisfies Development;
		const review = {
			id: "source-review-dev-recover-me",
			status: "pending_review",
			linkedDevelopment,
		} as SourceReview;

		expect(reconcileLinkedDevelopments([review], [])).toEqual([
			linkedDevelopment,
		]);
	});

	it("does not replace an existing canonical development", () => {
		const existing = {
			id: "dev-existing",
		} as Development;
		const review = {
			id: "source-review-dev-existing",
			status: "pending_review",
			linkedDevelopment: {
				...existing,
				title: "Stale snapshot",
			},
		} as SourceReview;

		expect(reconcileLinkedDevelopments([review], [existing])).toEqual([
			existing,
		]);
	});

	it("recovers a manually staged development from its retained snapshot", () => {
		const linkedDevelopment = {
			id: "dev-manually-staged",
			title: "Manual radar lead",
		} as Development;
		const review = {
			id: "source-review-uuid",
			status: "pending_review",
			linkedDevelopment,
		} as SourceReview;

		expect(reconcileLinkedDevelopments([review], [])).toEqual([
			linkedDevelopment,
		]);
	});

	it("reconstructs a rejected review snapshot only as dismissed", () => {
		const review = {
			id: "source-review-dev-rejected",
			status: "rejected",
			linkedDevelopment: {
				id: "dev-rejected",
				status: "detected",
			},
		} as SourceReview;

		expect(reconcileLinkedDevelopments([review], [])).toEqual([
			{
				id: "dev-rejected",
				status: "dismissed",
				dismissalReason: "Rejected during editorial review",
			},
		]);
	});

	it("repairs an existing detected development for a rejected review", () => {
		const development = {
			id: "dev-rejected-existing",
			status: "detected",
			title: "Rejected radar lead",
		} as Development;
		const review = {
			id: "source-review-dev-rejected-existing",
			status: "rejected",
			rejectionReason: "Not a discrete policy development",
		} as SourceReview;

		expect(
			reconcileLinkedDevelopments([review], [development]),
		).toEqual([
			{
				...development,
				status: "dismissed",
				dismissalReason: "Not a discrete policy development",
			},
		]);
	});

	it("recovers a published review as a promoted editorial development", () => {
		const sourceUrl = "https://example.gov.au/ai-policy";
		const verification = {
			status: "verified",
			source: { url: sourceUrl, contentHash: "a".repeat(64) },
			checkedAt: "2026-07-16T00:00:00.000Z",
			checkedBy: "reviewer",
			method: "manual",
		} as const;
		const review = {
			id: "source-review-dev-published",
			sourceUrl,
			title: "Staged title",
			entryKind: "policy",
			status: "published",
			discoveredAt: "2026-07-15T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: "policy",
				suggestedJurisdiction: "federal",
				summary: "Approved source-backed description.",
			},
			sourceEvidence: {
				url: sourceUrl,
				retrievedAt: "2026-07-16T00:00:00.000Z",
				contentHash: "a".repeat(64),
			},
			reviewedAt: "2026-07-16T00:00:00.000Z",
			updatedAt: "2026-07-16T00:00:00.000Z",
			linkedDevelopment: {
				id: "dev-published",
				title: "Staged title",
				url: sourceUrl,
				sourceId: "source",
				sourceName: "Source",
				jurisdiction: "federal",
				detectedAt: "2026-07-15T00:00:00.000Z",
				relevanceScore: 0.7,
				classification: "heuristic",
				assessment: {
					method: "heuristic",
					assessedAt: "2026-07-15T00:00:00.000Z",
					promptVersion: "test",
				},
				verification: {
					status: "needs_review",
					source: { url: sourceUrl },
				},
				status: "detected",
			},
			proposedRecord: {
				id: "published-policy",
				title: "Approved policy",
				description: "Approved source-backed description.",
				jurisdiction: "federal",
				type: "policy",
				status: "active",
				effectiveDate: "2026-07-01",
				dates: [
					{
						type: "published",
						date: "2026-07-01",
						precision: "day",
						primary: true,
					},
				],
				agencies: [],
				sourceUrl,
				content: "Approved content.",
				aiSummary: "Approved summary.",
				tags: ["ai"],
				createdAt: "2026-07-15T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
				verification,
			},
		} satisfies SourceReview;

		const [promoted] = reconcileLinkedDevelopments([review], []);
		expect(promoted).toEqual(
			expect.objectContaining({
				id: "dev-published",
				title: "Approved policy",
				status: "promoted",
				classification: "curated",
				relatedPolicyId: "published-policy",
				verification,
			}),
		);
		expect(
			reconcileLinkedDevelopments([review], [review.linkedDevelopment]),
		).toEqual([promoted]);

		const laterEditorialEdit = {
			...review.linkedDevelopment,
			summary: "A later editorial correction that recovery must preserve.",
			status: "promoted" as const,
		};
		expect(
			reconcileLinkedDevelopments([review], [laterEditorialEdit]),
		).toEqual([laterEditorialEdit]);
	});
});
