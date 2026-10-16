/* @vitest-environment node */

import path from "path";
import { describe, expect, it } from "vitest";
import {
	articleBodyLinks,
	citationState,
	parseArticle,
	readArticleSources,
	type ArticleSource,
} from "./articles";
import { buildPolicy } from "@/test/factories";

const FIXTURES = path.join(process.cwd(), "src/test/fixtures/articles");

async function fixture(slug: string): Promise<ArticleSource> {
	const found = (await readArticleSources(FIXTURES)).find(
		(entry) => entry.slug === slug,
	);
	if (!found) throw new Error(`missing fixture ${slug}`);
	return found;
}

async function errorsFor(slug: string): Promise<string[]> {
	const result = parseArticle(await fixture(slug));
	return result.ok ? [] : result.errors;
}

describe("parseArticle", () => {
	it.each(["js", "javascript"])(
		"refuses ---%s frontmatter without evaluating it",
		(language) => {
			const probe = globalThis as { policaiFrontmatterEvaluated?: boolean };
			delete probe.policaiFrontmatterEvaluated;
			const result = parseArticle({
				slug: "qa-js",
				source: `---${language}\n(globalThis.policaiFrontmatterEvaluated = true, { type: 'instrument_note', title: 'T' + String(6 * 7), summary: 'evaluated:' + typeof process, status: 'draft' })\n---\n\nBody.\n`,
			});
			expect(probe.policaiFrontmatterEvaluated).toBeUndefined();
			expect(result).toEqual({
				ok: false,
				errors: [
					`frontmatter is not valid YAML (frontmatter must be YAML, not ${language})`,
				],
			});
		},
	);

	it("parses a published piece into the typed model", async () => {
		const result = parseArticle(await fixture("fixture-weekly-published"));
		expect(result).toMatchObject({
			ok: true,
			article: {
				slug: "fixture-weekly-published",
				type: "weekly_briefing",
				status: "published",
				publishedAt: "2026-10-14",
				updatedAt: "2026-10-15",
				cites: ["fixture-current"],
				sources: ["https://www.example.gov.au/fixture-instrument"],
				corrections: [
					{
						date: "2026-10-15",
						text: "The fixture briefing first gave the wrong issuer. It now names the fixture department.",
					},
				],
			},
		});
	});

	it("parses a withdrawn piece with its date and reason", async () => {
		const result = parseArticle(await fixture("fixture-note-withdrawn"));
		expect(result).toMatchObject({
			ok: true,
			article: {
				status: "withdrawn",
				withdrawnAt: "2026-10-10",
				withdrawnReason:
					"The note described a different instrument from the one it cited.",
			},
		});
	});

	it("accepts a draft without citations", async () => {
		expect(parseArticle(await fixture("fixture-explainer-draft"))).toMatchObject({
			ok: true,
			article: { status: "draft", cites: [] },
		});
	});

	it("rejects a published piece with no citations", async () => {
		expect(await errorsFor("invalid-published-no-cites")).toEqual([
			"a published piece must cite at least one register record",
		]);
	});

	it("rejects a withdrawn piece without a reason", async () => {
		expect(await errorsFor("invalid-withdrawn-no-reason")).toEqual([
			"a withdrawn piece requires withdrawnReason",
		]);
	});

	it("rejects body links missing from cites or sources", async () => {
		expect(await errorsFor("invalid-body-links-unlisted")).toEqual([
			"body links /policies/fixture-other but cites does not list it",
			"body links https://news.example.com/story but sources does not list it",
		]);
	});

	it("rejects a source that is not an official host", async () => {
		expect(await errorsFor("invalid-unofficial-source")).toEqual([
			"sources[0] must be an https URL on a .gov.au or allow-listed official host",
		]);
	});

	it("rejects a correction dated before publication", async () => {
		expect(await errorsFor("invalid-correction-before-publication")).toEqual([
			"corrections[0] is dated before publishedAt",
		]);
	});

	it("rejects unknown fields and a bad slug", () => {
		expect(
			parseArticle({
				slug: "Bad_Slug",
				source: "---\ntype: explainer\ntitle: T\nsummary: S\nstatus: draft\ndisclosure: x\n---\n",
			}),
		).toEqual({
			ok: false,
			errors: [
				'slug "Bad_Slug" must be lowercase kebab-case',
				'unknown field "disclosure"',
			],
		});
	});
});

describe("articleBodyLinks", () => {
	it("classifies register, site and external links", () => {
		expect(
			articleBodyLinks(
				"[a](/policies/x) [b](https://policai.org/policies/y) [c](/developments#d) [e](https://www.example.gov.au/p \"t\") <https://www.example.gov.au/q>\n\n[ref]: https://www.example.gov.au/r",
			),
		).toEqual([
			{ kind: "policy", href: "/policies/x", policyId: "x" },
			{ kind: "policy", href: "https://policai.org/policies/y", policyId: "y" },
			{ kind: "site", href: "/developments#d" },
			{ kind: "external", href: "https://www.example.gov.au/p" },
			{ kind: "external", href: "https://www.example.gov.au/q" },
			{ kind: "external", href: "https://www.example.gov.au/r" },
		]);
	});

	it.each([
		"//news.example.com/story",
		"/\\evil.example.com/x",
		"\\\\evil.example.com/y",
		"/\\/evil.example.com/z",
		"https://policai.org.evil.example.com/policies/x",
		"javascript:void",
		"mailto:editor@example.gov.au",
		"example.gov.au/missing-scheme",
	])("classifies %s as external", (href) => {
		expect(articleBodyLinks(`[a](${href})`)).toEqual([{ kind: "external", href }]);
	});

	it.each([
		["/policies/x?tab=dates", { kind: "policy", policyId: "x" }],
		["https://policai.org/policies/y#history", { kind: "policy", policyId: "y" }],
		["/this-week", { kind: "site" }],
		["#coming-up", { kind: "site" }],
		["https://policai.org/analysis", { kind: "site" }],
	])("keeps %s on site", (href, expected) => {
		expect(articleBodyLinks(`[a](${href})`)).toEqual([{ ...expected, href }]);
	});

	it.each(["//news.example.com/story", "/\\evil.example.com/x"])(
		"rejects a published piece that links %s without listing it in sources",
		async (href) => {
			const entry = await fixture("fixture-weekly-published");
			const result = parseArticle({
				...entry,
				source: `${entry.source}\nSee [elsewhere](${href}).\n`,
			});
			expect(result).toEqual({
				ok: false,
				errors: [`body links ${href} but sources does not list it`],
			});
		},
	);
});

describe("citationState", () => {
	const current = buildPolicy({ id: "current" });
	const reviewDue = buildPolicy({
		id: "review-due",
		verification: { ...current.verification, status: "stale" },
	});
	const publicPolicies = new Map([
		[current.id, current],
		[reviewDue.id, reviewDue],
	]);

	it("reads the projected public verification", () => {
		expect(citationState(publicPolicies, "current")).toBe("current");
		expect(citationState(publicPolicies, "review-due")).toBe("review_due");
		expect(citationState(publicPolicies, "withheld")).toBe("not_public");
	});
});
