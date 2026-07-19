/* @vitest-environment node */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
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
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"));
		readJsonFile.mockReset();
		writeJsonFile.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
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

	it("removes supersession links to successor policies withheld from public reads", async () => {
		const successor = buildPolicy({
			id: "successor-policy",
			sourceUrl: "https://example.gov.au/policies/successor",
			verification: {
				...buildPolicy().verification,
				source: {
					url: "https://example.gov.au/policies/successor",
					contentHash: "a".repeat(64),
				},
				checkedAt: "2026-04-01T00:00:00.000Z",
			},
		});
		const predecessor = buildPolicy({
			id: "predecessor-policy",
			status: "superseded",
			sourceUrl: "https://example.gov.au/policies/predecessor",
			supersededBy: successor.id,
			verification: {
				...buildPolicy().verification,
				source: {
					url: "https://example.gov.au/policies/predecessor",
					contentHash: "a".repeat(64),
				},
			},
		});
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) {
					return [predecessor, successor];
				}
				if (filePath.endsWith("source-reviews.json")) return [];
				return fallback;
			},
		);

		const {
			getPolicies,
			getPolicyById,
			getPolicyBySourceUrl,
		} = await loadDataServiceModule();
		const [projected] = await getPolicies();
		const admin = await getPolicies(undefined, { access: "admin" });
		const projectedById = await getPolicyById(predecessor.id);
		const projectedBySource = await getPolicyBySourceUrl(
			predecessor.sourceUrl,
		);
		const adminById = await getPolicyById(predecessor.id, {
			access: "admin",
		});

		expect(projected.id).toBe(predecessor.id);
		expect(projected.supersededBy).toBeUndefined();
		expect(projectedById?.supersededBy).toBeUndefined();
		expect(projectedBySource?.supersededBy).toBeUndefined();
		expect(adminById?.supersededBy).toBe(successor.id);
		expect(
			admin.find((policy) => policy.id === predecessor.id)?.supersededBy,
		).toBe(successor.id);
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

	it("preserves an explicit editorial updatedAt during a full policy update", async () => {
		const policy = buildPolicy();
		const approvedUpdatedAt = "2026-07-16T09:30:00.000Z";
		readJsonFile.mockResolvedValue([policy]);

		const { updatePolicy } = await loadDataServiceModule();
		const updated = await updatePolicy(policy.id, {
			...policy,
			description: "Approved changed-source description.",
			updatedAt: approvedUpdatedAt,
		});

		expect(updated?.updatedAt).toBe(approvedUpdatedAt);
		expect(writeJsonFile.mock.calls[0]?.[1]?.[0]?.updatedAt).toBe(
			approvedUpdatedAt,
		);
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

	it("preserves reviewed agency accountability fields in public JSON", async () => {
		const agency = buildAgency({
			accountableOfficial: "Chief Data Officer",
			contactEmail: "ai@example.gov.au",
			auditFindings: "No material exceptions identified.",
		});
		readJsonFile.mockResolvedValue([agency]);

		const { getAgencies } = await loadDataServiceModule();

		await expect(getAgencies()).resolves.toEqual([
			expect.objectContaining({
				accountableOfficial: "Chief Data Officer",
				contactEmail: "ai@example.gov.au",
				auditFindings: "No material exceptions identified.",
			}),
		]);
	});

	it("withholds unverified agency claims and narrative from public reads", async () => {
		const agency = buildAgency({
			id: "agency-awaiting-review",
			policies: ["unverified-policy-association"],
			hasPublishedStatement: true,
			aiTransparencyStatement: "Unverified statement summary",
			aiUsageDisclosure: "Unverified usage claim",
			transparencyStatementUrl:
				"https://example.gov.au/agency/unverified-statement",
			lastUpdated: "2026-07-01",
			verification: {
				status: "needs_review",
				source: { url: "https://example.gov.au/agency" },
			},
		});
		readJsonFile.mockResolvedValue([agency]);

		const { getAgencies } = await loadDataServiceModule();

		await expect(getAgencies()).resolves.toEqual([
			expect.not.objectContaining({
				hasPublishedStatement: true,
				aiTransparencyStatement: expect.anything(),
				aiUsageDisclosure: expect.anything(),
				transparencyStatementUrl: expect.anything(),
				lastUpdated: expect.anything(),
				policies: expect.anything(),
			}),
		]);
		await expect(
			getAgencies(undefined, { access: "admin" }),
		).resolves.toEqual([agency]);
	});

	it("publishes only agency associations to currently public policies", async () => {
		const visiblePolicy = buildPolicy({ id: "visible-policy" });
		const withheldPolicy = buildPolicy({
			id: "withheld-policy",
			sourceUrl: "https://example.gov.au/policies/withheld-policy",
		});
		const agency = buildAgency({
			policies: [visiblePolicy.id, withheldPolicy.id],
		});
		const pendingUpdate = {
			id: "source-review-withheld-policy",
			sourceUrl: withheldPolicy.sourceUrl,
			title: withheldPolicy.title,
			entryKind: "policy" as const,
			targetPolicyId: withheldPolicy.id,
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: withheldPolicy.type,
				suggestedJurisdiction: withheldPolicy.jurisdiction,
				summary: "Source changed.",
			},
			sourceEvidence: { url: withheldPolicy.sourceUrl },
			proposedRecord: withheldPolicy,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("agencies.json")) return [agency];
				if (filePath.endsWith("policies.json")) {
					return [visiblePolicy, withheldPolicy];
				}
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingUpdate];
				}
				return fallback;
			},
		);

		const { getAgencies } = await loadDataServiceModule();
		const [projected] = await getAgencies();

		expect(projected.policies).toEqual([visiblePolicy.id]);
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

		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) {
					return [coveredPolicy, generatedPolicy];
				}
				if (filePath.endsWith("timeline.json")) return [manualEvent];
				return fallback;
			},
		);

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

	it("derives generated timeline types from structured dates and lifecycle status", async () => {
		const amendedPolicy = buildPolicy({
			id: "amended-policy",
			status: "active",
			effectiveDate: "2026-06-04",
			dates: [
				{
					type: "amended",
					date: "2026-06-04",
					precision: "month",
					primary: true,
					source: {
						url: "https://example.gov.au/policies/national-ai-ethics-framework",
					},
				},
			],
		});
		const supersededPolicy = buildPolicy({
			id: "superseded-policy",
			status: "superseded",
			sourceUrl: "https://example.gov.au/policies/superseded",
			dates: [
				{
					type: "published",
					date: "2025-01-01",
					precision: "day",
					primary: true,
					source: {
						url: "https://example.gov.au/policies/superseded",
					},
				},
			],
			verification: {
				status: "verified",
				checkedAt: "2026-07-10T00:00:00.000Z",
				checkedBy: "reviewer",
				method: "manual",
				source: {
					url: "https://example.gov.au/policies/superseded",
					contentHash: "a".repeat(64),
				},
			},
		});
		const datedSupersededPolicy = buildPolicy({
			id: "dated-superseded-policy",
			status: "superseded",
			sourceUrl: "https://example.gov.au/policies/dated-superseded",
			dates: [
				{
					type: "published",
					date: "2025-01-01",
					precision: "day",
					primary: true,
					source: {
						url: "https://example.gov.au/policies/dated-superseded",
					},
				},
				{
					type: "superseded",
					date: "2026-02-01",
					precision: "day",
					source: {
						url: "https://example.gov.au/policies/dated-superseded",
					},
				},
			],
			verification: {
				status: "verified",
				checkedAt: "2026-07-10T00:00:00.000Z",
				checkedBy: "reviewer",
				method: "manual",
				source: {
					url: "https://example.gov.au/policies/dated-superseded",
					contentHash: "a".repeat(64),
				},
			},
		});
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) {
					return [
						amendedPolicy,
						supersededPolicy,
						datedSupersededPolicy,
					];
				}
				if (filePath.endsWith("timeline.json")) return [];
				return fallback;
			},
		);

		const { getTimelineEvents } = await loadDataServiceModule();
		const result = await getTimelineEvents();

		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					relatedPolicyId: amendedPolicy.id,
					type: "policy_amended",
					datePrecision: "month",
				}),
				expect.objectContaining({
					relatedPolicyId: supersededPolicy.id,
					type: "policy_introduced",
					date: "2025-01-01",
				}),
				expect.objectContaining({
					relatedPolicyId: datedSupersededPolicy.id,
					type: "policy_superseded",
					date: "2026-02-01",
				}),
			]),
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

	it("withholds unverified policies from public reads but keeps them available to editors", async () => {
		const verified = buildPolicy({ id: "verified-policy" });
		const unverified = buildPolicy({
			id: "unverified-policy",
			verification: {
				status: "needs_review",
				source: { url: "https://example.gov.au/policy" },
			},
		});
		readJsonFile.mockResolvedValue([verified, unverified]);

		const { getPolicies } = await loadDataServiceModule();

		await expect(getPolicies()).resolves.toEqual([verified]);
		await expect(
			getPolicies(undefined, { access: "admin" }),
		).resolves.toHaveLength(2);
	});

	it("withholds a newly written policy until its approved review finishes publication", async () => {
		const policy = buildPolicy({ id: "partially-published-policy" });
		const approvedReview = {
			id: "source-review-partial-policy",
			sourceUrl: policy.sourceUrl,
			title: policy.title,
			entryKind: "policy" as const,
			status: "approved" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: policy.type,
				suggestedJurisdiction: policy.jurisdiction,
				summary: policy.description,
			},
			sourceEvidence: policy.verification.source,
			proposedRecord: policy,
			reviewedAt: "2026-07-16T00:00:00.000Z",
			reviewedBy: "reviewer",
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) {
					return [approvedReview];
				}
				return fallback;
			},
		);

		const { getPolicies } = await loadDataServiceModule();

		await expect(getPolicies()).resolves.toEqual([]);
		await expect(
			getPolicies(undefined, { access: "admin" }),
		).resolves.toEqual([policy]);

		const auditedPolicy = {
			...policy,
			verification: {
				...policy.verification,
				lastSourceAuditAt: "2026-07-16T01:00:00.000Z",
				source: {
					...policy.verification.source,
					retrievedAt: "2026-07-16T01:00:00.000Z",
					etag: '"audited"',
				},
			},
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [auditedPolicy];
				if (filePath.endsWith("source-reviews.json")) {
					return [approvedReview];
				}
				return fallback;
			},
		);

		await expect(getPolicies()).resolves.toEqual([]);
	});

	it("does not let an approved draft id collision hide an unrelated policy", async () => {
		const existing = buildPolicy({ id: "shared-policy-id" });
		const collidingDraft = buildPolicy({
			id: existing.id,
			sourceUrl: "https://example.gov.au/policies/colliding-draft",
			verification: {
				...buildPolicy().verification,
				source: {
					url: "https://example.gov.au/policies/colliding-draft",
					contentHash: "b".repeat(64),
				},
			},
		});
		const approvedReview = {
			id: "source-review-colliding-draft",
			sourceUrl: collidingDraft.sourceUrl,
			title: collidingDraft.title,
			entryKind: "policy" as const,
			status: "approved" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: collidingDraft.type,
				suggestedJurisdiction: collidingDraft.jurisdiction,
				summary: collidingDraft.description,
			},
			sourceEvidence: collidingDraft.verification.source,
			proposedRecord: collidingDraft,
			reviewedAt: "2026-07-16T00:00:00.000Z",
			reviewedBy: "reviewer",
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [existing];
				if (filePath.endsWith("source-reviews.json")) {
					return [approvedReview];
				}
				return fallback;
			},
		);

		const { getPolicies } = await loadDataServiceModule();

		await expect(getPolicies()).resolves.toEqual([existing]);
	});

	it("withholds policies after the 90-day editorial review interval expires", async () => {
		const expired = buildPolicy({
			id: "expired-policy",
			verification: {
				...buildPolicy().verification,
				checkedAt: "2026-04-16T11:59:59.999Z",
			},
		});
		readJsonFile.mockResolvedValue([expired]);

		const { getPolicies } = await loadDataServiceModule();

		await expect(getPolicies()).resolves.toEqual([]);
		await expect(
			getPolicies(undefined, { access: "admin" }),
		).resolves.toEqual([expired]);
	});

	it("withholds a verified policy while a changed-source update awaits review", async () => {
		const policy = buildPolicy({ id: "policy-under-reverification" });
		const pendingUpdate = {
			id: "source-review-update-1",
			sourceUrl: policy.sourceUrl,
			title: policy.title,
			entryKind: "policy" as const,
			targetPolicyId: policy.id,
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: policy.type,
				suggestedJurisdiction: policy.jurisdiction,
				summary: "The official source changed.",
			},
			sourceEvidence: {
				url: policy.sourceUrl,
				retrievedAt: "2026-07-16T00:00:00.000Z",
			},
			proposedRecord: policy,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingUpdate];
				}
				return fallback;
			},
		);

		const {
			getPolicies,
			getPolicyById,
			getPolicyBySourceUrl,
		} = await loadDataServiceModule();

		await expect(getPolicies()).resolves.toEqual([]);
		await expect(getPolicyById(policy.id)).resolves.toBeNull();
		await expect(
			getPolicyBySourceUrl(policy.sourceUrl),
		).resolves.toBeNull();
		await expect(
			getPolicies(undefined, { access: "admin" }),
		).resolves.toEqual([policy]);
	});

	it("withholds unverified manual timeline events from public reads", async () => {
		const verified = buildTimelineEvent({ id: "timeline-verified" });
		const unverified = buildTimelineEvent({
			id: "timeline-unverified",
			verification: {
				status: "needs_review",
				source: { url: "https://example.gov.au/timeline" },
			},
		});
		readJsonFile.mockResolvedValue([verified, unverified]);

		const { getTimelineEvents } = await loadDataServiceModule();

		await expect(
			getTimelineEvents(undefined, { includeGenerated: false }),
		).resolves.toEqual([verified]);
		await expect(
			getTimelineEvents(undefined, {
				includeGenerated: false,
				access: "admin",
			}),
		).resolves.toEqual([verified, unverified]);
	});

	it("withholds a newly written timeline event until publication finishes", async () => {
		const event = buildTimelineEvent({ id: "partially-published-event" });
		const approvedReview = {
			id: "source-review-partial-event",
			sourceUrl: event.sourceUrl,
			title: event.title,
			entryKind: "timeline_event" as const,
			status: "approved" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: "policy",
				suggestedJurisdiction: event.jurisdiction,
				summary: event.description,
			},
			sourceEvidence: event.verification.source,
			proposedRecord: event,
			reviewedAt: "2026-07-16T00:00:00.000Z",
			reviewedBy: "reviewer",
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("timeline.json")) return [event];
				if (filePath.endsWith("source-reviews.json")) {
					return [approvedReview];
				}
				return fallback;
			},
		);

		const { getTimelineEvents } = await loadDataServiceModule();

		await expect(
			getTimelineEvents(undefined, { includeGenerated: false }),
		).resolves.toEqual([]);
		await expect(
			getTimelineEvents(undefined, {
				includeGenerated: false,
				access: "admin",
			}),
		).resolves.toEqual([event]);

		const auditedEvent = {
			...event,
			verification: {
				...event.verification,
				lastSourceAuditAt: "2026-07-16T01:00:00.000Z",
				source: {
					...event.verification.source,
					retrievedAt: "2026-07-16T01:00:00.000Z",
					etag: '"audited"',
				},
			},
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("timeline.json")) return [auditedEvent];
				if (filePath.endsWith("source-reviews.json")) {
					return [approvedReview];
				}
				return fallback;
			},
		);

		await expect(
			getTimelineEvents(undefined, { includeGenerated: false }),
		).resolves.toEqual([]);
	});

	it("withholds an existing timeline event while re-verification is pending", async () => {
		const event = buildTimelineEvent({ id: "timeline-reverification" });
		const pendingReview = {
			id: "source-review-timeline-reverification",
			sourceUrl: event.sourceUrl,
			title: event.title,
			entryKind: "timeline_event" as const,
			targetTimelineEventId: event.id,
			targetTimelineRevisionHash: "a".repeat(64),
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "mcp-editor",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: "policy",
				suggestedJurisdiction: event.jurisdiction,
				summary: event.description,
			},
			sourceEvidence: event.verification.source,
			proposedRecord: event,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("timeline.json")) return [event];
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingReview];
				}
				return fallback;
			},
		);

		const { getTimelineEvents } = await loadDataServiceModule();

		await expect(
			getTimelineEvents(undefined, { includeGenerated: false }),
		).resolves.toEqual([]);
		await expect(
			getTimelineEvents(undefined, {
				includeGenerated: false,
				access: "admin",
			}),
		).resolves.toEqual([event]);
	});

	it("removes manual timeline relations to publicly withheld policies", async () => {
		const policy = buildPolicy({ id: "withheld-related-policy" });
		const event = buildTimelineEvent({
			id: "timeline-with-withheld-relation",
			relatedPolicyId: policy.id,
		});
		const pendingPolicyReview = {
			id: "source-review-withheld-related-policy",
			sourceUrl: policy.sourceUrl,
			title: policy.title,
			entryKind: "policy" as const,
			targetPolicyId: policy.id,
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: policy.type,
				suggestedJurisdiction: policy.jurisdiction,
				summary: "Source changed.",
			},
			sourceEvidence: policy.verification.source,
			proposedRecord: policy,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("timeline.json")) return [event];
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingPolicyReview];
				}
				return fallback;
			},
		);

		const { getTimelineEvents } = await loadDataServiceModule();
		const [projected] = await getTimelineEvents(undefined, {
			includeGenerated: false,
		});
		const [admin] = await getTimelineEvents(undefined, {
			includeGenerated: false,
			access: "admin",
		});

		expect(projected).toMatchObject({ id: event.id });
		expect(projected.relatedPolicyId).toBeUndefined();
		expect(admin.relatedPolicyId).toBe(policy.id);
	});

	it("does not append generated policy events to a manual-only timeline read", async () => {
		const policy = buildPolicy({ id: "generated-policy" });
		const event = buildTimelineEvent({
			id: "manual-only-event",
			relatedPolicyId: undefined,
		});
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("timeline.json")) return [event];
				if (filePath.endsWith("source-reviews.json")) return [];
				return fallback;
			},
		);

		const { getTimelineEvents } = await loadDataServiceModule();

		await expect(
			getTimelineEvents(undefined, { includeGenerated: false }),
		).resolves.toEqual([event]);
	});

	it("does not let an approved timeline id collision hide an unrelated event", async () => {
		const existing = buildTimelineEvent({ id: "shared-timeline-id" });
		const collidingDraft = buildTimelineEvent({
			id: existing.id,
			sourceUrl: "https://example.gov.au/timeline/colliding-draft",
			verification: {
				...buildTimelineEvent().verification,
				source: {
					url: "https://example.gov.au/timeline/colliding-draft",
					contentHash: "b".repeat(64),
				},
			},
		});
		const approvedReview = {
			id: "source-review-colliding-timeline",
			sourceUrl: collidingDraft.sourceUrl,
			title: collidingDraft.title,
			entryKind: "timeline_event" as const,
			status: "approved" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: null,
				suggestedJurisdiction: collidingDraft.jurisdiction,
				summary: collidingDraft.description,
			},
			sourceEvidence: collidingDraft.verification.source,
			proposedRecord: collidingDraft,
			reviewedAt: "2026-07-16T00:00:00.000Z",
			reviewedBy: "reviewer",
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("timeline.json")) return [existing];
				if (filePath.endsWith("source-reviews.json")) {
					return [approvedReview];
				}
				return fallback;
			},
		);

		const { getTimelineEvents } = await loadDataServiceModule();

		await expect(
			getTimelineEvents(undefined, { includeGenerated: false }),
		).resolves.toEqual([existing]);
	});

	it("projects expired agency verification as stale and withholds its narrative", async () => {
		const agency = buildAgency({
			aiTransparencyStatement: "Old statement",
			hasPublishedStatement: true,
			transparencyStatementUrl:
				"https://example.gov.au/agency/stale-statement",
			verification: {
				...buildAgency().verification,
				checkedAt: "2026-04-01T00:00:00.000Z",
			},
		});
		readJsonFile.mockResolvedValue([agency]);

		const { getAgencies } = await loadDataServiceModule();
		const [projected] = await getAgencies();

		expect(projected.verification.status).toBe("stale");
		expect(projected.aiTransparencyStatement).toBeUndefined();
		expect(projected.hasPublishedStatement).toBeUndefined();
		expect(projected.transparencyStatementUrl).toBeUndefined();
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
				assessment: {
					method: "heuristic",
					assessedAt: "2026-06-01T00:00:00.000Z",
					promptVersion: "test",
				},
				verification: {
					status: "needs_review",
					source: { url: "https://example.gov.au/older" },
				},
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
				assessment: {
					method: "ai",
					assessedAt: "2026-06-15T00:00:00.000Z",
					promptVersion: "test",
				},
				verification: {
					status: "needs_review",
					source: { url: "https://example.gov.au/newer" },
				},
				status: "detected",
			},
		]);

		const { getDevelopments } = await loadDataServiceModule();
		const result = await getDevelopments({ limit: 1 });

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("dev-newer");
	});

	it("exposes radar leads but withholds dismissed developments publicly", async () => {
		const base = {
			title: "Development",
			url: "https://example.gov.au/development",
			sourceId: "s",
			sourceName: "S",
			jurisdiction: "federal" as const,
			detectedAt: "2026-06-01T00:00:00.000Z",
			relevanceScore: 0.7,
			classification: "heuristic" as const,
			assessment: {
				method: "heuristic" as const,
				assessedAt: "2026-06-01T00:00:00.000Z",
				promptVersion: "test",
			},
		};
		const verified = {
			...base,
			id: "verified",
			status: "detected" as const,
			verification: {
				status: "verified" as const,
				source: {
					url: base.url,
					contentHash: "a".repeat(64),
				},
				checkedAt: "2026-06-01T00:00:00.000Z",
				checkedBy: "test",
				method: "manual" as const,
			},
		};
		const pending = {
			...base,
			id: "pending",
			status: "detected" as const,
			verification: {
				status: "needs_review" as const,
				source: { url: base.url },
			},
		};
		const dismissed = {
			...verified,
			id: "dismissed",
			status: "dismissed" as const,
		};
		readJsonFile.mockResolvedValue([verified, pending, dismissed]);

		const { getDevelopments } = await loadDataServiceModule();

		await expect(getDevelopments()).resolves.toEqual([verified, pending]);
		await expect(
			getDevelopments(undefined, { access: "admin" }),
		).resolves.toHaveLength(3);
	});

	it("withholds a lead when its rejected review outlives a failed dismissal write", async () => {
		const development = {
			id: "dev-rejected-partial-write",
			title: "Rejected development",
			url: "https://example.gov.au/rejected-development",
			sourceId: "s",
			sourceName: "S",
			jurisdiction: "federal" as const,
			detectedAt: "2026-06-01T00:00:00.000Z",
			relevanceScore: 0.7,
			classification: "heuristic" as const,
			assessment: {
				method: "heuristic" as const,
				assessedAt: "2026-06-01T00:00:00.000Z",
				promptVersion: "test",
			},
			verification: {
				status: "needs_review" as const,
				source: { url: "https://example.gov.au/rejected-development" },
			},
			status: "detected" as const,
		};
		const rejectedReview = {
			id: "source-review-dev-rejected-partial-write",
			status: "rejected" as const,
			rejectionReason: "Rejected during editorial review",
			linkedDevelopment: development,
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("developments.json")) return [development];
				if (filePath.endsWith("source-reviews.json")) {
					return [rejectedReview];
				}
				return fallback;
			},
		);

		const { getDevelopments } = await loadDataServiceModule();

		await expect(getDevelopments()).resolves.toEqual([]);
		await expect(
			getDevelopments(undefined, { access: "admin" }),
		).resolves.toEqual([development]);
	});

	it("removes related policy links when the policy is publicly withheld", async () => {
		const policy = buildPolicy({ id: "withheld-policy" });
		const development = {
			id: "promoted-development",
			title: "Promoted development",
			url: policy.sourceUrl,
			sourceId: "s",
			sourceName: "S",
			jurisdiction: "federal" as const,
			detectedAt: "2026-06-01T00:00:00.000Z",
			relevanceScore: 1,
			classification: "curated" as const,
			assessment: {
				method: "editorial" as const,
				assessedAt: "2026-06-01T00:00:00.000Z",
				promptVersion: "editorial-review-v1",
			},
			verification: policy.verification,
			status: "promoted" as const,
			relatedPolicyId: policy.id,
		};
		const pendingUpdate = {
			id: "source-review-withheld-policy",
			sourceUrl: policy.sourceUrl,
			title: policy.title,
			entryKind: "policy" as const,
			targetPolicyId: policy.id,
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: policy.type,
				suggestedJurisdiction: policy.jurisdiction,
				summary: "Source changed.",
			},
			sourceEvidence: { url: policy.sourceUrl },
			proposedRecord: policy,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("developments.json")) {
					return [development];
				}
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingUpdate];
				}
				return fallback;
			},
		);

		const { getDevelopments } = await loadDataServiceModule();
		const [projected] = await getDevelopments();
		const [admin] = await getDevelopments(undefined, {
			access: "admin",
		});

		expect(projected.relatedPolicyId).toBeUndefined();
		expect(projected.verification).toMatchObject({
			status: "stale",
			notes: "The related policy is withheld pending re-verification.",
		});
		expect(admin.relatedPolicyId).toBe(policy.id);
		expect(admin.verification.status).toBe("verified");
	});

	it("downgrades a promoted development while its timeline event is withheld", async () => {
		const policy = buildPolicy({ id: "still-public-policy" });
		const event = buildTimelineEvent({
			id: "withheld-timeline-event",
			relatedPolicyId: policy.id,
		});
		const development = {
			id: "promoted-timeline-development",
			title: event.title,
			url: event.sourceUrl,
			sourceId: "s",
			sourceName: "S",
			jurisdiction: event.jurisdiction,
			detectedAt: "2026-06-01T00:00:00.000Z",
			relevanceScore: 1,
			classification: "curated" as const,
			assessment: {
				method: "editorial" as const,
				assessedAt: "2026-06-01T00:00:00.000Z",
				promptVersion: "editorial-review-v1",
			},
			verification: event.verification,
			status: "promoted" as const,
			relatedPolicyId: policy.id,
			relatedTimelineEventId: event.id,
		};
		const pendingUpdate = {
			id: "source-review-withheld-timeline-event",
			sourceUrl: event.sourceUrl,
			title: event.title,
			entryKind: "timeline_event" as const,
			targetTimelineEventId: event.id,
			targetTimelineRevisionHash: "a".repeat(64),
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: null,
				suggestedJurisdiction: event.jurisdiction,
				summary: "Timeline source changed.",
			},
			sourceEvidence: { url: event.sourceUrl },
			proposedRecord: event,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("developments.json")) return [development];
				if (filePath.endsWith("timeline.json")) return [event];
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingUpdate];
				}
				return fallback;
			},
		);

		const { getDevelopments } = await loadDataServiceModule();
		const [projected] = await getDevelopments();
		const [admin] = await getDevelopments(undefined, { access: "admin" });

		expect(projected.relatedTimelineEventId).toBeUndefined();
		expect(projected.relatedPolicyId).toBe(policy.id);
		expect(projected.verification).toMatchObject({
			status: "stale",
			notes:
				"The related timeline event is withheld pending re-verification.",
		});
		expect(admin.relatedTimelineEventId).toBe(event.id);
		expect(admin.relatedPolicyId).toBe(policy.id);
		expect(admin.verification.status).toBe("verified");
	});

	it("updates development editorial disposition in the canonical feed", async () => {
		const development = {
			id: "dev-review-me",
			title: "Development",
			url: "https://example.gov.au/development",
			sourceId: "s",
			sourceName: "S",
			jurisdiction: "federal" as const,
			detectedAt: "2026-06-01T00:00:00.000Z",
			relevanceScore: 0.7,
			classification: "heuristic" as const,
			assessment: {
				method: "heuristic" as const,
				assessedAt: "2026-06-01T00:00:00.000Z",
				promptVersion: "test",
			},
			verification: {
				status: "needs_review" as const,
				source: { url: "https://example.gov.au/development" },
			},
			status: "detected" as const,
		};
		readJsonFile.mockResolvedValue([development]);

		const { updateDevelopment } = await loadDataServiceModule();
		const updated = await updateDevelopment(development.id, {
			status: "dismissed",
			dismissalReason: "Duplicate",
		});

		expect(updated).toMatchObject({
			status: "dismissed",
			dismissalReason: "Duplicate",
		});
		expect(writeJsonFile).toHaveBeenCalledWith(
			expect.stringContaining("developments.json"),
			[expect.objectContaining({ status: "dismissed" })],
		);
	});

	it("withholds the framework artifact while its related policy awaits re-verification", async () => {
		const policy = buildPolicy({ id: "framework-policy" });
		const artifact = {
			id: "framework-artifact",
			relatedPolicyId: policy.id,
			verification: {
				status: "verified",
				source: { url: policy.sourceUrl },
			},
		};
		const pendingUpdate = {
			id: "source-review-framework-update",
			sourceUrl: policy.sourceUrl,
			title: policy.title,
			entryKind: "policy" as const,
			targetPolicyId: policy.id,
			status: "pending_review" as const,
			discoveredAt: "2026-07-16T00:00:00.000Z",
			createdBy: "collector",
			analysis: {
				isRelevant: true,
				relevanceScore: 1,
				suggestedType: policy.type,
				suggestedJurisdiction: policy.jurisdiction,
				summary: "Source changed.",
			},
			sourceEvidence: { url: policy.sourceUrl },
			proposedRecord: policy,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("dta-ai-policy-framework.json")) {
					return artifact;
				}
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) {
					return [pendingUpdate];
				}
				return fallback;
			},
		);

		const { getPolicyFrameworkArtifact } =
			await loadDataServiceModule();

		await expect(getPolicyFrameworkArtifact()).resolves.toBeNull();
		await expect(
			getPolicyFrameworkArtifact({ access: "admin" }),
		).resolves.toEqual(artifact);
	});

	it("requires and preserves the framework artifact's own current verification", async () => {
		const policy = buildPolicy({ id: "framework-policy" });
		const currentArtifact = {
			id: "framework-artifact",
			relatedPolicyId: policy.id,
			sourceUrl: policy.sourceUrl,
			verification: {
				status: "verified",
				checkedAt: "2026-07-12T00:00:00.000Z",
				checkedBy: "framework-reviewer",
				method: "manual",
				source: {
					url: policy.sourceUrl,
					contentHash: "a".repeat(64),
				},
			},
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("dta-ai-policy-framework.json")) {
					return currentArtifact;
				}
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) return [];
				return fallback;
			},
		);

		const { getPolicyFrameworkArtifact } =
			await loadDataServiceModule();

		await expect(
			getPolicyFrameworkArtifact({
				now: new Date("2026-07-16T00:00:00.000Z"),
			}),
		).resolves.toEqual(currentArtifact);

		const staleArtifact = {
			...currentArtifact,
			verification: {
				...currentArtifact.verification,
				checkedAt: "2026-01-01T00:00:00.000Z",
			},
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("dta-ai-policy-framework.json")) {
					return staleArtifact;
				}
				if (filePath.endsWith("policies.json")) return [policy];
				if (filePath.endsWith("source-reviews.json")) return [];
				return fallback;
			},
		);

		await expect(
			getPolicyFrameworkArtifact({
				now: new Date("2026-07-16T00:00:00.000Z"),
			}),
		).resolves.toBeNull();

		const reverifiedPolicy = {
			...policy,
			verification: {
				...policy.verification,
				checkedAt: "2026-07-15T00:00:00.000Z",
			},
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) => {
				if (filePath.endsWith("dta-ai-policy-framework.json")) {
					return currentArtifact;
				}
				if (filePath.endsWith("policies.json")) {
					return [reverifiedPolicy];
				}
				if (filePath.endsWith("source-reviews.json")) return [];
				return fallback;
			},
		);

		await expect(
			getPolicyFrameworkArtifact({
				now: new Date("2026-07-16T00:00:00.000Z"),
			}),
		).resolves.toBeNull();
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
			sourceUrlExists(
				"https://example.gov.au/policy/?utm_source=email#details",
			),
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
			sourceEvidence: {
				url: "https://example.gov.au/new-policy",
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

	it("retains prior inspection evidence when refreshing a manual source review", async () => {
		readJsonFile.mockResolvedValue({
			manualReviews: [
				{
					sourceId: "manual-source",
					status: "checked",
					reviewedAt: "2026-07-15T00:00:00.000Z",
					reviewedBy: "Earlier reviewer",
					evidence: {
						url: "https://example.gov.au/manual",
						title: "Official AI guidance",
						publisher: "Example Department",
						finalUrl: "https://example.gov.au/guidance/ai",
					},
					notes: "Inspected the complete source listing in a browser.",
				},
			],
		});

		const { upsertManualSourceReview } = await loadDataServiceModule();
		const updated = await upsertManualSourceReview({
			sourceId: "manual-source",
			status: "checked",
			reviewedAt: "2026-07-16T00:00:00.000Z",
			reviewedBy: "Current reviewer",
			evidence: { url: "https://example.gov.au/manual" },
			notes: "Reviewed every current entry and found no new instrument.",
		});

		expect(updated.manualReviews[0].evidence).toEqual({
			url: "https://example.gov.au/manual",
			title: "Official AI guidance",
			publisher: "Example Department",
			finalUrl: "https://example.gov.au/guidance/ai",
		});
		expect(writeJsonFile).toHaveBeenCalledWith(
			expect.stringContaining("source-monitoring.json"),
			updated,
		);
	});

	it("does not relabel prior evidence when a manual source URL changes", async () => {
		readJsonFile.mockResolvedValue({
			manualReviews: [
				{
					sourceId: "manual-source",
					status: "checked",
					reviewedAt: "2026-07-15T00:00:00.000Z",
					reviewedBy: "Earlier reviewer",
					evidence: {
						url: "https://example.gov.au/old-source",
						finalUrl: "https://example.gov.au/old-canonical",
						retrievedAt: "2026-07-15T00:00:00.000Z",
						contentHash: "a".repeat(64),
						title: "Old source title",
					},
				},
			],
		});

		const { upsertManualSourceReview } = await loadDataServiceModule();
		const updated = await upsertManualSourceReview({
			sourceId: "manual-source",
			status: "checked",
			reviewedAt: "2026-07-16T00:00:00.000Z",
			reviewedBy: "Current reviewer",
			evidence: { url: "https://example.gov.au/new-source" },
		});

		expect(updated.manualReviews[0].evidence).toEqual({
			url: "https://example.gov.au/new-source",
		});
	});

	it("never moves the global editorial review timestamp backwards", async () => {
		const meta = {
			lastCollectedAt: "2026-07-16T00:00:00.000Z",
			lastHealthyAt: "2026-07-16T00:00:00.000Z",
			lastReviewedAt: "2026-07-16T12:00:00.000Z",
			collector: {
				runCount: 1,
				lastRunSources: [],
				lastRunErrors: [],
				health: "healthy" as const,
				dueSourceCount: 0,
				successfulSourceCount: 0,
				failedSourceCount: 0,
				skippedSourceCount: 0,
				successRate: 1,
				automaticSourceCount: 0,
				manualSourceCount: 0,
				sourceResults: [],
			},
		};
		readJsonFile.mockImplementation(
			async (filePath: string, fallback: unknown) =>
				filePath.endsWith("meta.json") ? meta : fallback,
		);

		const { markCollectionReviewed } = await loadDataServiceModule();
		const updated = await markCollectionReviewed(
			"2026-07-16T10:00:00.000Z",
		);

		expect(updated.lastReviewedAt).toBe(meta.lastReviewedAt);
		expect(writeJsonFile).toHaveBeenCalledWith(
			expect.stringContaining("meta.json"),
			expect.objectContaining({ lastReviewedAt: meta.lastReviewedAt }),
		);
	});
});
