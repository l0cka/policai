/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("deployment data packaging", () => {
	it("traces canonical and public metadata JSON into every server route", () => {
		expect(nextConfig.outputFileTracingIncludes).toMatchObject({
			"/*": expect.arrayContaining([
				"./data/**/*.json",
				"./public/data/**/*.json",
			]),
		});
	});

	it("permanently redirects the retired network view to the coverage map", async () => {
		const redirects = await nextConfig.redirects?.();
		expect(redirects).toContainEqual({
			source: "/network",
			destination: "/coverage",
			permanent: true,
		});
	});
});
