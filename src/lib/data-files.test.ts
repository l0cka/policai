import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_FILES, dataFile } from "./data-files";

describe("data files", () => {
	it("resolves a name against the working directory by default", () => {
		expect(dataFile("policies")).toBe(
			path.join(process.cwd(), "data", "policies.json"),
		);
		expect(dataFile("meta")).toBe(
			path.join(process.cwd(), "public", "data", "meta.json"),
		);
	});

	it("resolves a name against another root", () => {
		expect(dataFile("watchState", "/tmp/elsewhere")).toBe(
			path.join("/tmp/elsewhere", "data", "watch-state.json"),
		);
	});

	it("names only repo-relative paths that exist in the checkout", () => {
		for (const relative of Object.values(DATA_FILES)) {
			expect(relative).toMatch(/^(data|public\/data)\//);
			expect(existsSync(path.join(process.cwd(), relative)), relative).toBe(true);
		}
	});

	it("cannot be changed at runtime", () => {
		expect(Object.isFrozen(DATA_FILES)).toBe(true);
	});
});
