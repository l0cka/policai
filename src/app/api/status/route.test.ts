/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCollectionMeta, getDevelopments, getSourceMonitoring } = vi.hoisted(() => ({
	getCollectionMeta: vi.fn(),
	getDevelopments: vi.fn(),
	getSourceMonitoring: vi.fn(),
}));

vi.mock("@/lib/data-service", () => ({
	getCollectionMeta,
	getDevelopments,
	getSourceMonitoring,
}));

import { GET } from "./route";

describe("/api/status", () => {
	beforeEach(() => {
		getCollectionMeta.mockReset();
		getDevelopments.mockReset();
		getSourceMonitoring.mockReset();
		getSourceMonitoring.mockResolvedValue({ manualReviews: [] });
	});

	it("returns null freshness data before the collector has ever run", async () => {
		getCollectionMeta.mockResolvedValue({
			lastCollectedAt: null,
			lastHealthyAt: null,
			lastReviewedAt: null,
			collector: {
				runCount: 0,
				lastRunSources: [],
				lastRunErrors: [],
				health: "failed",
				dueSourceCount: 0,
				successfulSourceCount: 0,
				failedSourceCount: 0,
				skippedSourceCount: 0,
				successRate: 0,
				automaticSourceCount: 13,
				manualSourceCount: 14,
				sourceResults: [],
			},
		});
		getDevelopments.mockResolvedValue([]);

		const response = await GET();

		await expect(response.json()).resolves.toEqual({
			lastCollectedAt: null,
			lastHealthyAt: null,
			lastReviewedAt: null,
			collection: {
				health: "failed",
				dueSourceCount: 0,
				successfulSourceCount: 0,
				failedSourceCount: 0,
				successRate: 0,
				automaticSourceCount: 13,
				manualSourceCount: 14,
				manualCurrentCount: 0,
				manualUnavailableCount: 0,
			},
			latestDevelopment: null,
			success: true,
		});
	});

	it("returns collection freshness and the latest development", async () => {
		getCollectionMeta.mockResolvedValue({
			lastCollectedAt: "2026-07-10T05:30:00.000Z",
			lastHealthyAt: "2026-07-10T05:30:00.000Z",
			lastReviewedAt: "2026-07-01T00:00:00.000Z",
			collector: {
				runCount: 4,
				lastRunSources: ["dta-ai-policy"],
				lastRunErrors: [],
				health: "healthy",
				dueSourceCount: 1,
				successfulSourceCount: 1,
				failedSourceCount: 0,
				skippedSourceCount: 0,
				successRate: 1,
				automaticSourceCount: 13,
				manualSourceCount: 14,
				sourceResults: [],
			},
		});
		getDevelopments.mockResolvedValue([
			{
				id: "dev-1",
				title: "New OAIC guidance on AI and privacy",
				url: "https://www.oaic.gov.au/example",
				sourceId: "oaic-ai-guidance",
				sourceName: "OAIC AI Guidance",
				jurisdiction: "federal",
				detectedAt: "2026-07-10T05:30:00.000Z",
				relevanceScore: 0.9,
				classification: "ai",
				assessment: {
					method: "ai",
					assessedAt: "2026-07-10T05:30:00.000Z",
					promptVersion: "test-v1",
				},
				verification: {
					status: "needs_review",
					source: { url: "https://www.oaic.gov.au/example" },
				},
				status: "detected",
			},
		]);

		const response = await GET();

		await expect(response.json()).resolves.toEqual({
			lastCollectedAt: "2026-07-10T05:30:00.000Z",
			lastHealthyAt: "2026-07-10T05:30:00.000Z",
			lastReviewedAt: "2026-07-01T00:00:00.000Z",
			collection: {
				health: "healthy",
				dueSourceCount: 1,
				successfulSourceCount: 1,
				failedSourceCount: 0,
				successRate: 1,
				automaticSourceCount: 13,
				manualSourceCount: 14,
				manualCurrentCount: 0,
				manualUnavailableCount: 0,
			},
			latestDevelopment: {
				id: "dev-1",
				title: "New OAIC guidance on AI and privacy",
				url: "https://www.oaic.gov.au/example",
				detectedAt: "2026-07-10T05:30:00.000Z",
				verificationStatus: "needs_review",
			},
			success: true,
		});

		expect(getDevelopments).toHaveBeenCalledWith({ limit: 1 });
	});
});
