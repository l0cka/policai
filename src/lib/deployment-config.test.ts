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
});
