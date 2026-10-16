/* @vitest-environment node */

import path from "path";
import { describe, expect, it } from "vitest";
import { readArticleSources, type ArticleSource } from "./articles";
import {
	articleCitationReport,
	validateArticles,
	type CitedRecordState,
} from "./validate-data";
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

describe("articleCitationReport", () => {
	const label = "data/articles/piece.md";
	const states = new Map<string, CitedRecordState>([
		["current", "current"],
		["review-due", "review_due"],
		["withheld", "not_public"],
		["trashed", "trashed"],
	]);
	const reviewDue = `${label}: cites "review-due", which is past its review interval (Source under review)`;
	const withheld = `${label}: cites "withheld", which is withheld or unverified (Source under review)`;
	const trashed = `${label}: cites trashed register record "trashed"`;
	const missing = `${label}: cites unknown register record "missing"`;

	it.each([
		[
			"a new piece",
			[],
			["current", "review-due", "withheld", "trashed", "missing"],
			[reviewDue, withheld, trashed, missing],
			[],
		],
		["a changed piece with an added citation", ["current"], ["current", "withheld"], [withheld], []],
		[
			"a piece whose existing citations went stale or were withheld",
			["current", "review-due", "withheld"],
			["current", "review-due", "withheld"],
			[],
			[reviewDue, withheld],
		],
		["existing citations to trashed or missing records", ["trashed", "missing"], ["trashed", "missing"], [trashed, missing], []],
		["a dropped citation", ["withheld", "current"], ["current"], [], []],
	])("%s", (_, baseCites, headCites, errors, warnings) => {
		expect(articleCitationReport(label, baseCites, headCites, states)).toEqual({
			errors,
			warnings,
		});
	});
});

describe("validateArticles citations", () => {
	const withheldMessage =
		'data/articles/citation-withheld.md: cites "fixture-withheld", which is withheld or unverified (Source under review)';
	const reviewDueMessage =
		'data/articles/citation-review-due.md: cites "fixture-review-due", which is past its review interval (Source under review)';

	function edited(entry: ArticleSource): ArticleSource {
		return { ...entry, source: entry.source.replace("See the", "Read the") };
	}

	it.each([
		["citation-withheld", [withheldMessage]],
		["citation-review-due", [reviewDueMessage]],
		["fixture-weekly-published", []],
	])("checks every citation of new piece %s", async (slug, errors) => {
		const entry = await fixture(slug);
		expect(validateArticles([entry], [], targets)).toEqual({ errors, warnings: [] });
		expect(validateArticles([entry], null, targets)).toEqual({ errors, warnings: [] });
	});

	it("errors only on the citation a changed piece adds", async () => {
		const base = await fixture("fixture-weekly-published");
		const head = {
			...base,
			source: base.source.replace(
				"  - fixture-current\n",
				"  - fixture-current\n  - fixture-withheld\n  - fixture-review-due\n",
			),
		};
		expect(validateArticles([head], [base], targets)).toEqual({
			errors: [
				'data/articles/fixture-weekly-published.md: cites "fixture-withheld", which is withheld or unverified (Source under review)',
				'data/articles/fixture-weekly-published.md: cites "fixture-review-due", which is past its review interval (Source under review)',
			],
			warnings: [],
		});
	});

	it.each([
		["citation-withheld", withheldMessage],
		["citation-review-due", reviewDueMessage],
	])("warns on an existing citation of %s, changed or untouched", async (slug, message) => {
		const entry = await fixture(slug);
		const result = { errors: [], warnings: [message] };
		expect(validateArticles([entry], [entry], targets)).toEqual(result);
		expect(validateArticles([edited(entry)], [entry], targets)).toEqual(result);
	});

	it("lets a correction be appended to a piece whose citation went stale", async () => {
		const base = await fixture("citation-review-due");
		const corrected = {
			...base,
			source: base.source.replace(
				"\n---\n",
				"\ncorrections:\n  - date: 2026-10-20\n    text: The fixture record is under review.\n---\n",
			),
		};
		expect(validateArticles([corrected], [base], targets)).toEqual({
			errors: [],
			warnings: [reviewDueMessage],
		});
	});

	it("treats a draft's citations as new when it is published", async () => {
		const published = await fixture("citation-withheld");
		const draft = {
			...published,
			source: published.source.replace("status: published", "status: draft"),
		};
		expect(validateArticles([published], [draft], targets)).toEqual({
			errors: [withheldMessage],
			warnings: [],
		});
	});

	it.each([
		["invalid-cites-unknown", 'cites unknown register record "fixture-missing"'],
		["invalid-cites-trashed", 'cites trashed register record "fixture-trashed"'],
	])("%s is an error whether new, changed or untouched", async (slug, message) => {
		const entry = await fixture(slug);
		for (const base of [[], [edited(entry)], [entry]]) {
			expect(validateArticles([entry], base, targets)).toEqual({
				errors: [`data/articles/${slug}.md: ${message}`],
				warnings: [],
			});
		}
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

describe("validateArticles figures", () => {
	const figureIds = [
		"nsw-identifying-ai-guidance",
		"fwc-genai-guidance-note",
		"oaic-app-1-7-adm-transparency-guidance",
		"federal-court-gpn-ai",
		"nsw-supreme-court-sc-gen-23",
		"nsw-ai-operational-policy",
		"nsw-artificial-intelligence-assessment-framework",
	];
	const cited = figureIds.map((id, index) =>
		buildPolicy({ id, jurisdiction: index < 3 ? "federal" : index < 5 ? "nsw" : "vic" }),
	);
	const staleCounted = buildPolicy({
		id: "fixture-counted-review-due",
		jurisdiction: "qld",
		verification: { ...current.verification, status: "stale" },
	});
	const figureTargets = {
		images: new Map(),
		policies: [...cited, staleCounted, withheld],
		publicPolicies: [...cited, staleCounted],
	};

	it("accepts a published piece with one figure of each kind", async () => {
		const entry = await fixture("figure-kinds-published");
		expect(validateArticles([entry], [], figureTargets)).toEqual({ errors: [], warnings: [] });
	});

	it("counts a review-due record in a chart without an error or a warning", async () => {
		const entry = await fixture("figure-kinds-published");
		const base = { ...entry, source: entry.source.replace(/```figure\nkind: chart[\s\S]*?```\n/, "") };
		expect(validateArticles([entry], [base], figureTargets)).toEqual({ errors: [], warnings: [] });
	});

	it.each([
		["invalid-figure-chart-no-match", "figure 1: the register query matches no public record"],
		["invalid-figure-chart-count", "figure 1: a chart needs 3 to 10 bars; the register query gives 2"],
	])("checks %s against the public register", async (slug, message) => {
		const entry = await fixture(slug);
		expect(validateArticles([entry], [], figureTargets).errors).toEqual([
			`data/articles/${slug}.md: cites unknown register record "fixture-chart-only"`,
			`data/articles/${slug}.md: ${message}`,
		]);
	});

	it("applies the added-citation rule to a figure's cites", async () => {
		const entry = await fixture("figure-citation-withheld");
		const message =
			'data/articles/figure-citation-withheld.md: cites "fixture-withheld", which is withheld or unverified (Source under review)';
		expect(validateArticles([entry], [], targets)).toEqual({ errors: [message], warnings: [] });
		expect(validateArticles([entry], [entry], targets)).toEqual({ errors: [], warnings: [message] });
	});
});
