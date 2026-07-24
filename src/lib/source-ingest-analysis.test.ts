/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";

const {
	analyseContentRelevance,
	extractRetrievedDocument,
	retrieveSource,
} = vi.hoisted(() => ({
	analyseContentRelevance: vi.fn(),
	extractRetrievedDocument: vi.fn(),
	retrieveSource: vi.fn(),
}));

vi.mock("@/lib/analysis", () => ({ analyseContentRelevance }));
vi.mock("@/lib/pipeline/content", () => ({ extractRetrievedDocument }));
vi.mock("@/lib/pipeline/fetch", () => ({ retrieveSource }));

import { analyseSourceUrl } from "./source-ingest";

describe("source ingest analysis", () => {
	it("uses the public-HTTPS retrieval policy for an explicit stage-only source", async () => {
		retrieveSource.mockResolvedValue({
			body: "<main>Independent analysis</main>",
			durationMs: 1,
			evidence: {
				url: "https://policy.example.com/analysis",
				finalUrl: "https://policy.example.com/analysis",
				retrievedAt: "2026-07-16T00:00:00.000Z",
				contentType: "text/html",
				contentHash: "a".repeat(64),
			},
		});
		extractRetrievedDocument.mockResolvedValue({
			title: "Independent AI policy analysis",
			text: "Analysis of Australian AI policy.",
		});
		analyseContentRelevance.mockResolvedValue({
			isRelevant: true,
			relevanceScore: 0.8,
			summary: "Relevant independent analysis.",
			tags: ["ai"],
			agencies: [],
			keyDates: [],
			relatedTopics: [],
		});

		await analyseSourceUrl("https://policy.example.com/analysis", {
			stageOnly: true,
		});

		expect(analyseContentRelevance).toHaveBeenCalledWith(
			"Analysis of Australian AI policy.",
			"https://policy.example.com/analysis",
			"Independent AI policy analysis",
		);
		expect(retrieveSource).toHaveBeenCalledWith(
			"https://policy.example.com/analysis",
			{
				destinationPolicy: "public-https",
				timeoutMs: 60_000,
			},
		);
	});
});
