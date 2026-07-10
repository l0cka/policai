/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCollectionMeta, getDevelopments } = vi.hoisted(() => ({
	getCollectionMeta: vi.fn(),
	getDevelopments: vi.fn(),
}));

vi.mock("@/lib/data-service", () => ({
	getCollectionMeta,
	getDevelopments,
}));

import { GET } from "./route";

describe("/api/status", () => {
	beforeEach(() => {
		getCollectionMeta.mockReset();
		getDevelopments.mockReset();
	});

	it("returns null freshness data before the collector has ever run", async () => {
		getCollectionMeta.mockResolvedValue({
			lastCollectedAt: null,
			lastReviewedAt: null,
			collector: { runCount: 0, lastRunSources: [], lastRunErrors: [] },
		});
		getDevelopments.mockResolvedValue([]);

		const response = await GET();

		await expect(response.json()).resolves.toEqual({
			lastCollectedAt: null,
			lastReviewedAt: null,
			latestDevelopment: null,
			success: true,
		});
	});

	it("returns collection freshness and the latest development", async () => {
		getCollectionMeta.mockResolvedValue({
			lastCollectedAt: "2026-07-10T05:30:00.000Z",
			lastReviewedAt: "2026-07-01T00:00:00.000Z",
			collector: {
				runCount: 4,
				lastRunSources: ["dta-ai-policy"],
				lastRunErrors: [],
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
				status: "detected",
			},
		]);

		const response = await GET();

		await expect(response.json()).resolves.toEqual({
			lastCollectedAt: "2026-07-10T05:30:00.000Z",
			lastReviewedAt: "2026-07-01T00:00:00.000Z",
			latestDevelopment: {
				id: "dev-1",
				title: "New OAIC guidance on AI and privacy",
				url: "https://www.oaic.gov.au/example",
				detectedAt: "2026-07-10T05:30:00.000Z",
			},
			success: true,
		});

		expect(getDevelopments).toHaveBeenCalledWith({ limit: 1 });
	});
});
