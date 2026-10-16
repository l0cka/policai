/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
	it("parses YAML frontmatter and the body", () => {
		const file = parseFrontmatter("---\ntitle: Home\n---\nBody\n");
		expect(file.data).toEqual({ title: "Home" });
		expect(file.content).toBe("Body\n");
	});

	it("accepts the yaml and yml fence labels", () => {
		expect(parseFrontmatter("---yaml\ntitle: A\n---\n").data).toEqual({ title: "A" });
		expect(parseFrontmatter("---yml\ntitle: B\n---\n").data).toEqual({ title: "B" });
	});

	it.each([
		["js", "frontmatter must be YAML, not js"],
		["javascript", "frontmatter must be YAML, not javascript"],
		["json", "frontmatter must be YAML, not json"],
		["coffee", 'gray-matter engine "coffee" is not registered'],
	])("refuses ---%s frontmatter", (language, message) => {
		const probe = globalThis as { policaiFrontmatterEvaluated?: boolean };
		delete probe.policaiFrontmatterEvaluated;
		expect(() =>
			parseFrontmatter(
				`---${language}\n(globalThis.policaiFrontmatterEvaluated = true, { "title": "T" })\n---\nBody\n`,
			),
		).toThrow(message);
		expect(probe.policaiFrontmatterEvaluated).toBeUndefined();
	});
});
