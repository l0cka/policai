/* @vitest-environment node */

import path from "path";
import { describe, expect, it } from "vitest";
import { readArticleSources, type ArticleSource } from "./articles";
import { validateArticles } from "./validate-data";
import { buildPolicy } from "@/test/factories";

const FIXTURES = path.join(process.cwd(), "src/test/fixtures/articles");

const current = buildPolicy({ id: "fixture-current" });
const reviewDue = buildPolicy({
	id: "fixture-review-due",
	verification: { ...current.verification, status: "stale" },
});
const withheld = buildPolicy({ id: "fixture-withheld" });
const trashed = buildPolicy({ id: "fixture-trashed", status: "trashed" });

const targets = {
	images: new Map(),
	policies: [current, reviewDue, withheld, trashed],
	publicPolicies: [current, reviewDue],
};

async function fixture(slug: string): Promise<ArticleSource> {
	const found = (await readArticleSources(FIXTURES)).find(
		(entry) => entry.slug === slug,
	);
	if (!found) throw new Error(`missing fixture ${slug}`);
	return found;
}

function baseFor(entry: ArticleSource, change: "new" | "changed" | "untouched") {
	if (change === "new") return [];
	if (change === "untouched") return [entry];
	return [{ ...entry, source: entry.source.replace("See the", "Read the") }];
}

describe("validateArticles citations", () => {
	const withheldMessage =
		'data/articles/citation-withheld.md: cites "fixture-withheld", which is withheld or unverified (Source under review)';
	const reviewDueMessage =
		'data/articles/citation-review-due.md: cites "fixture-review-due", which is past its review interval (Source under review)';

	it.each([
		["citation-withheld", "new", [withheldMessage], []],
		["citation-withheld", "changed", [withheldMessage], []],
		["citation-withheld", "untouched", [], [withheldMessage]],
		["citation-review-due", "new", [reviewDueMessage], []],
		["citation-review-due", "changed", [reviewDueMessage], []],
		["citation-review-due", "untouched", [], [reviewDueMessage]],
		["fixture-weekly-published", "new", [], []],
		["fixture-weekly-published", "untouched", [], []],
	] as const)("%s when %s", async (slug, change, errors, warnings) => {
		const entry = await fixture(slug);
		expect(validateArticles([entry], baseFor(entry, change), targets)).toEqual({
			errors,
			warnings,
		});
	});

	it.each([
		["invalid-cites-unknown", 'cites unknown register record "fixture-missing"'],
		["invalid-cites-trashed", 'cites trashed register record "fixture-trashed"'],
	])("%s is an error even when untouched", async (slug, message) => {
		const entry = await fixture(slug);
		for (const change of ["new", "changed", "untouched"] as const) {
			expect(
				validateArticles([entry], baseFor(entry, change), targets),
			).toEqual({ errors: [`data/articles/${slug}.md: ${message}`], warnings: [] });
		}
	});

	it("treats every piece as new without a base", async () => {
		const entry = await fixture("citation-withheld");
		expect(validateArticles([entry], null, targets).errors).toEqual([
			withheldMessage,
		]);
	});

	it("reports parse errors with the file path", async () => {
		const entry = await fixture("invalid-published-no-cites");
		expect(validateArticles([entry], [], targets).errors).toEqual([
			"data/articles/invalid-published-no-cites.md: a published piece must cite at least one register record",
		]);
	});

	it("does not check citations on drafts or withdrawn pieces", async () => {
		const entries = [
			await fixture("fixture-explainer-draft"),
			await fixture("fixture-note-withdrawn"),
		];
		expect(
			validateArticles(entries, [], { policies: [], publicPolicies: [], images: new Map() }),
		).toEqual({ errors: [], warnings: [] });
	});
});

describe("validateArticles transitions", () => {
	it("forbids deleting, unpublishing and re-dating a published piece", async () => {
		const published = await fixture("fixture-weekly-published");
		expect(validateArticles([], [published], targets).errors).toEqual([
			"data/articles/fixture-weekly-published.md: a published piece cannot be deleted; withdraw it instead",
		]);

		const unpublished = {
			...published,
			source: published.source
				.replace("status: published", "status: draft")
				.replace(/corrections:[\s\S]*?---/, "---"),
		};
		expect(validateArticles([unpublished], [published], targets).errors).toEqual([
			"data/articles/fixture-weekly-published.md: a published piece cannot return to draft",
			"data/articles/fixture-weekly-published.md: corrections are append-only; an earlier correction was changed or removed",
		]);

		const redated = {
			...published,
			source: published.source.replace("publishedAt: 2026-10-14", "publishedAt: 2026-10-13"),
		};
		expect(validateArticles([redated], [published], targets).errors).toEqual([
			"data/articles/fixture-weekly-published.md: publishedAt cannot change after publication",
		]);
	});

	it("keeps a withdrawn piece withdrawn", async () => {
		const withdrawn = await fixture("fixture-note-withdrawn");
		const republished = {
			...withdrawn,
			source: withdrawn.source
				.replace("status: withdrawn", "status: published")
				.replace(/withdrawnAt:.*\n/, "")
				.replace(/withdrawnReason:.*\n/, ""),
		};
		expect(validateArticles([republished], [withdrawn], targets).errors).toEqual([
			"data/articles/fixture-note-withdrawn.md: a withdrawn piece stays withdrawn",
		]);
	});

	it("allows appending a correction and withdrawing", async () => {
		const published = await fixture("fixture-weekly-published");
		const appended = {
			...published,
			source: published.source.replace(
				"cites:",
				"withdrawnAt: 2026-10-20\nwithdrawnReason: Fixture withdrawal.\ncites:",
			).replace("status: published", "status: withdrawn").replace(
				"\n---\n\nThe",
				"\n  - date: 2026-10-20\n    text: \"Update: the fixture source changed.\"\n---\n\nThe",
			),
		};
		expect(validateArticles([appended], [published], targets)).toEqual({
			errors: [],
			warnings: [],
		});
	});
});
