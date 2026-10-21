/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPolicyById, updatePolicy } = vi.hoisted(() => ({
	getPolicyById: vi.fn(),
	updatePolicy: vi.fn(),
}));

vi.mock("@/lib/data-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/data-service")>();
	return {
		...actual,
		getPolicyById,
		updatePolicy,
	};
});

vi.mock("@/lib/data-lock", () => ({
	withDataMutationLock: <T>(run: () => Promise<T>) => run(),
}));

import { verifyRegisterRecord } from "./source-ingest";

const SOURCE = {
	url: "https://example.gov.au/policy",
	retrievedAt: "2026-07-16T00:00:00.000Z",
	contentHash: "a".repeat(64),
};

describe("verifyRegisterRecord", () => {
	beforeEach(() => {
		getPolicyById.mockReset();
		updatePolicy.mockReset();
	});

	it("stamps lastReviewedAt and verified status on a public record", async () => {
		const publicPolicy = {
			id: "federal-example",
			title: "Example",
			status: "active",
			verification: { status: "verified", source: SOURCE },
			lastReviewedAt: "2026-01-01T00:00:00.000Z",
		};
		getPolicyById.mockResolvedValueOnce(publicPolicy);
		updatePolicy.mockResolvedValue({
			...publicPolicy,
			lastReviewedAt: "2026-10-19T00:00:00.000Z",
			verification: {
				status: "verified",
				source: SOURCE,
				checkedAt: "2026-10-19T00:00:00.000Z",
				checkedBy: "Daniel",
				method: "manual",
				notes: "Signal note",
			},
		});

		const updated = await verifyRegisterRecord({
			policyId: "federal-example",
			actor: "Daniel",
			notes: "Signal note",
			now: "2026-10-19T00:00:00.000Z",
		});

		expect(updatePolicy).toHaveBeenCalledWith("federal-example", {
			lastReviewedAt: "2026-10-19T00:00:00.000Z",
			verification: {
				status: "verified",
				source: SOURCE,
				checkedAt: "2026-10-19T00:00:00.000Z",
				checkedBy: "Daniel",
				method: "manual",
				notes: "Signal note",
			},
		});
		expect(updated.id).toBe("federal-example");
	});

	it("refuses a withheld or non-public record", async () => {
		getPolicyById
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				id: "withheld-1",
				status: "active",
				verification: { status: "needs_review", source: SOURCE },
			});

		await expect(
			verifyRegisterRecord({
				policyId: "withheld-1",
				actor: "Daniel",
			}),
		).rejects.toThrow(/not public/);
		expect(updatePolicy).not.toHaveBeenCalled();
	});

	it("refuses a trashed record", async () => {
		getPolicyById
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				id: "old-1",
				status: "trashed",
				verification: { status: "needs_review", source: SOURCE },
			});

		await expect(
			verifyRegisterRecord({ policyId: "old-1", actor: "Daniel" }),
		).rejects.toThrow(/trashed/);
		expect(updatePolicy).not.toHaveBeenCalled();
	});
});
