/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildAgency,
	buildPolicy,
	buildTimelineEvent,
} from "@/test/factories";

const readJsonFile = vi.fn();
const writeJsonFile = vi.fn();

vi.mock("@/lib/file-store", () => ({
	readJsonFile,
	writeJsonFile,
}));

async function loadDataServiceModule() {
	vi.resetModules();
	return import("./data-service");
}

describe("data-service file store", () => {
	beforeEach(() => {
		readJsonFile.mockReset();
		writeJsonFile.mockReset();
	});

	it("filters and sorts policies from the JSON fallback", async () => {
		const older = buildPolicy({
			id: "older-policy",
			title: "Older ethics policy",
			effectiveDate: "2024-01-01",
			tags: ["ethics"],
		});
		const newer = buildPolicy({
			id: "newer-policy",
			title: "Newer ethics policy",
			effectiveDate: "2025-03-01",
			tags: ["ethics", "governance"],
		});
		const excluded = buildPolicy({
			id: "excluded-policy",
			jurisdiction: "nsw",
			tags: ["other"],
		});

		readJsonFile.mockResolvedValue([older, newer, excluded]);

		const { getPolicies } = await loadDataServiceModule();
		const result = await getPolicies({
			jurisdiction: "federal",
			search: "ethics",
		});

		expect(result.map((policy) => policy.id)).toEqual([
			"newer-policy",
			"older-policy",
		]);
	});

	it("throws a typed error when a duplicate policy is created", async () => {
		const existing = buildPolicy();
		readJsonFile.mockResolvedValue([existing]);

		const { createPolicy, DuplicatePolicyError } =
			await loadDataServiceModule();

		await expect(createPolicy(existing)).rejects.toBeInstanceOf(
			DuplicatePolicyError,
		);
		expect(writeJsonFile).not.toHaveBeenCalled();
	});

	it("adds and removes trashed metadata when policy status changes", async () => {
		const policy = buildPolicy();
		readJsonFile.mockResolvedValue([policy]);

		const { updatePolicy } = await loadDataServiceModule();

		const trashed = await updatePolicy(policy.id, { status: "trashed" });
		expect(trashed).toEqual(
			expect.objectContaining({
				status: "trashed",
				trashedAt: expect.any(String),
			}),
		);

		const persistedAfterTrash = writeJsonFile.mock.calls[0]?.[1]?.[0];
		expect(persistedAfterTrash).toEqual(
			expect.objectContaining({
				status: "trashed",
				trashedAt: expect.any(String),
			}),
		);

		readJsonFile.mockResolvedValue([
			{
				...policy,
				status: "trashed",
				trashedAt: "2025-01-02T00:00:00.000Z",
			},
		]);

		const restored = await updatePolicy(policy.id, { status: "active" });
		expect(restored).toEqual(expect.objectContaining({ status: "active" }));
		expect(restored).not.toHaveProperty("trashedAt");
	});

	it("filters agencies and sorts them alphabetically", async () => {
		readJsonFile.mockResolvedValue([
			buildAgency({ id: "a-2", name: "Zeta Office" }),
			buildAgency({ id: "a-1", name: "Alpha Office" }),
			buildAgency({
				id: "a-3",
				level: "state",
				jurisdiction: "nsw",
				name: "NSW Office",
			}),
		]);

		const { getAgencies } = await loadDataServiceModule();
		const result = await getAgencies({ level: "federal" });

		expect(result.map((agency) => agency.name)).toEqual([
			"Alpha Office",
			"Zeta Office",
		]);
	});

	it("merges curated and generated timeline events without duplicating curated policy entries", async () => {
		const coveredPolicy = buildPolicy({
			id: "covered-policy",
			title: "Covered policy",
			effectiveDate: "2025-01-10",
		});
		const generatedPolicy = buildPolicy({
			id: "generated-policy",
			title: "Generated policy",
			effectiveDate: "2025-01-20",
			description: "x".repeat(240),
		});
		const manualEvent = buildTimelineEvent({
			id: "manual-event",
			date: "2025-01-05",
			relatedPolicyId: coveredPolicy.id,
		});

		readJsonFile
			.mockResolvedValueOnce([coveredPolicy, generatedPolicy])
			.mockResolvedValueOnce([manualEvent]);

		const { getTimelineEvents } = await loadDataServiceModule();
		const result = await getTimelineEvents({ jurisdiction: "federal" });

		expect(result.map((event) => event.id)).toEqual([
			"manual-event",
			"policy-timeline-generated-policy",
		]);
		expect(result[1]).toEqual(
			expect.objectContaining({
				title: "Generated policy",
				description: `${"x".repeat(197)}...`,
			}),
		);
	});

	it("keeps superseded and closed policies visible in public reads", async () => {
		readJsonFile.mockResolvedValue([
			buildPolicy({ id: "active-policy", status: "active" }),
			buildPolicy({ id: "superseded-policy", status: "superseded" }),
			buildPolicy({ id: "closed-policy", status: "closed" }),
			buildPolicy({ id: "trashed-policy", status: "trashed" }),
		]);

		const { getPolicies } = await loadDataServiceModule();
		const result = await getPolicies();

		expect(result.map((policy) => policy.id).sort()).toEqual([
			"active-policy",
			"closed-policy",
			"superseded-policy",
		]);
	});

	it("sorts developments by published date and honours the limit", async () => {
		readJsonFile.mockResolvedValue([
			{
				id: "dev-older",
				title: "Older",
				url: "https://example.gov.au/older",
				sourceId: "s",
				sourceName: "S",
				jurisdiction: "federal",
				detectedAt: "2026-06-01T00:00:00.000Z",
				relevanceScore: 0.7,
				classification: "heuristic",
				status: "detected",
			},
			{
				id: "dev-newer",
				title: "Newer",
				url: "https://example.gov.au/newer",
				sourceId: "s",
				sourceName: "S",
				jurisdiction: "federal",
				publishedAt: "2026-07-01",
				detectedAt: "2026-06-15T00:00:00.000Z",
				relevanceScore: 0.9,
				classification: "ai",
				status: "detected",
			},
		]);

		const { getDevelopments } = await loadDataServiceModule();
		const result = await getDevelopments({ limit: 1 });

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("dev-newer");
	});

	it("detects duplicate source URLs across tracked policies", async () => {
		const existing = buildPolicy({
			sourceUrl: "https://example.gov.au/policy",
		});
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [existing];
				return fallback;
			},
		);

		const { sourceUrlExists } = await loadDataServiceModule();

		await expect(
			sourceUrlExists("https://example.gov.au/policy"),
		).resolves.toBe(true);
	});

	it("detects duplicate source URLs across staged source reviews", async () => {
		const stagedReview = {
			id: "source-review-1",
			sourceUrl: "https://example.gov.au/staged-policy",
			title: "Staged policy",
			entryKind: "policy" as const,
			status: "pending_review" as const,
			discoveredAt: "2026-05-01T00:00:00.000Z",
			createdBy: "local-mcp-admin",
			analysis: {
				isRelevant: true,
				relevanceScore: 0.9,
				suggestedType: "guideline" as const,
				suggestedJurisdiction: "federal" as const,
				summary: "A relevant policy.",
			},
			proposedRecord: buildPolicy({
				sourceUrl: "https://example.gov.au/staged-policy",
			}),
			updatedAt: "2026-05-01T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("source-reviews.json")) return [stagedReview];
				return fallback;
			},
		);

		const { sourceUrlExists } = await loadDataServiceModule();

		await expect(
			sourceUrlExists("https://example.gov.au/staged-policy"),
		).resolves.toBe(true);
		await expect(
			sourceUrlExists("https://example.gov.au/staged-policy", {
				excludeSourceReviewId: "source-review-1",
			}),
		).resolves.toBe(false);
	});

	it("creates source reviews in the JSON fallback after duplicate checks", async () => {
		readJsonFile.mockImplementation(
			async (_filePath: string, fallback: unknown) => fallback,
		);

		const { createSourceReview } = await loadDataServiceModule();
		const review = await createSourceReview({
			id: "source-review-1",
			sourceUrl: "https://example.gov.au/new-policy",
			title: "New policy",
			entryKind: "policy",
			status: "pending_review",
			discoveredAt: "2026-05-01T00:00:00.000Z",
			createdBy: "local-mcp-admin",
			analysis: {
				isRelevant: true,
				relevanceScore: 0.9,
				suggestedType: "guideline",
				suggestedJurisdiction: "federal",
				summary: "A relevant policy.",
			},
			proposedRecord: buildPolicy({
				id: "new-policy",
				sourceUrl: "https://example.gov.au/new-policy",
			}),
			updatedAt: "2026-05-01T00:00:00.000Z",
		});

		expect(review.id).toBe("source-review-1");
		expect(writeJsonFile).toHaveBeenCalledWith(
			expect.stringContaining("source-reviews.json"),
			[expect.objectContaining({ id: "source-review-1" })],
		);
	});

	it("creates manual timeline events in the JSON fallback", async () => {
		readJsonFile.mockImplementation(
			async (_filePath: string, fallback: unknown) => fallback,
		);

		const { createTimelineEvent } = await loadDataServiceModule();
		const event = buildTimelineEvent({
			id: "timeline-new",
			sourceUrl: "https://example.gov.au/timeline-new",
		});

		await expect(createTimelineEvent(event)).resolves.toEqual(event);
		expect(writeJsonFile).toHaveBeenCalledWith(
			expect.stringContaining("timeline.json"),
			[event],
		);
	});
});
