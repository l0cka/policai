/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildPolicy } from "@/test/factories";
import {
	EDITORIAL_REVIEW_INTERVAL_DAYS,
	isVerificationCurrent,
	projectVerificationForPublic,
} from "./verification";

describe("verification freshness", () => {
	const now = new Date("2026-07-16T00:00:00.000Z");

	it("accepts a verified record through the review interval boundary", () => {
		const verification = buildPolicy().verification;
		verification.checkedAt = new Date(
			now.getTime() -
				EDITORIAL_REVIEW_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
		).toISOString();

		expect(isVerificationCurrent(verification, now)).toBe(true);
	});

	it("rejects expired timestamps and future timestamps beyond clock skew", () => {
		const expired = buildPolicy().verification;
		expired.checkedAt = "2026-04-16T23:59:59.999Z";
		const future = buildPolicy().verification;
		future.checkedAt = "2026-07-16T00:05:00.001Z";
		const smallClockSkew = buildPolicy().verification;
		smallClockSkew.checkedAt = "2026-07-16T00:04:59.999Z";

		expect(isVerificationCurrent(expired, now)).toBe(false);
		expect(isVerificationCurrent(future, now)).toBe(false);
		expect(isVerificationCurrent(smallClockSkew, now)).toBe(true);
	});

	it("projects expired verified metadata as stale without mutating the source record", () => {
		const verification = {
			...buildPolicy().verification,
			checkedAt: "2026-01-01T00:00:00.000Z",
		};

		const projected = projectVerificationForPublic(verification, now);

		expect(projected.status).toBe("stale");
		expect(projected.notes).toContain("90 days expired");
		expect(verification.status).toBe("verified");
	});

	it("withholds verified records that have no reproducible source fingerprint", () => {
		const verification = buildPolicy().verification;
		delete verification.source.contentHash;

		expect(isVerificationCurrent(verification, now)).toBe(false);

		const projected = projectVerificationForPublic(verification, now);
		expect(projected.status).toBe("stale");
		expect(projected.notes).toContain("No reproducible source fingerprint");
	});

	it("requires attributable manual editorial verification for public currency", () => {
		const automated = buildPolicy().verification;
		automated.method = "automated";
		const unattributed = buildPolicy().verification;
		unattributed.checkedBy = "";

		expect(isVerificationCurrent(automated, now)).toBe(false);
		expect(isVerificationCurrent(unattributed, now)).toBe(false);
		expect(projectVerificationForPublic(automated, now).notes).toContain(
			"No manual editorial verification",
		);
		expect(projectVerificationForPublic(unattributed, now).notes).toContain(
			"No attributable editorial reviewer",
		);
	});
});
