/* @vitest-environment node */

import path from "path";
import { describe, expect, it } from "vitest";
import { parseArticle, readArticleSources, type ArticleSource } from "./articles";
import { registerChart } from "./article-figures";
import { buildPolicy } from "@/test/factories";
import type { Article, ArticleFigure, ChartFigure, Policy } from "@/types";

const FIXTURES = path.join(process.cwd(), "src/test/fixtures/articles");

async function fixture(slug: string): Promise<ArticleSource> {
	const found = (await readArticleSources(FIXTURES)).find((entry) => entry.slug === slug);
	if (!found) throw new Error(`missing fixture ${slug}`);
	return found;
}

function parsed(entry: ArticleSource): Article {
	const result = parseArticle(entry);
	if (!result.ok) throw new Error(result.errors.join("\n"));
	return result.article;
}

function figures(article: Article): ArticleFigure[] {
	return article.blocks.flatMap((block) => (block.kind === "figure" ? [block.figure] : []));
}

const PIECE = `---
type: explainer
title: Inline piece
summary: An inline piece for figure parsing.
status: draft
cites: [fixture-current]
sources: [https://www.example.gov.au/fixture-instrument]
---
`;

const TIMELINE = `kind: timeline
title: The fixture instrument took effect before its review
alt: The fixture instrument was issued in March and took effect in July.
caption: Dates as recorded in the register at 16 October 2026.
asAt: 2026-10-16
cites: [fixture-current]
entries:
  - date: 2026-03
    title: Fixture instrument issued
  - date: 2027
    title: Fixture instrument reviewed`;

function inline(body: string): ArticleSource {
	return { slug: "inline-piece", source: `${PIECE}\n${body}\n` };
}

function errorsOf(entry: ArticleSource): string[] {
	const result = parseArticle(entry);
	return result.ok ? [] : result.errors;
}

const FLOW_FRAME = `kind: flow
title: The fixture instrument applies after one check
alt: Agencies check the instrument, apply it, and record the result.
caption: The path in the fixture instrument at 16 October 2026.
cites: [fixture-current]`;

describe("figure blocks in article Markdown", () => {
	it("parses one figure of each kind in document order with per-piece numbers", async () => {
		const article = parsed(await fixture("figure-kinds-published"));
		const numbered = article.blocks.flatMap((block) =>
			block.kind === "figure" ? [[block.number, block.figure.kind]] : [],
		);
		expect(numbered).toEqual([
			[1, "timeline"],
			[2, "matrix"],
			[3, "flow"],
			[4, "chart"],
		]);
		expect(article.blocks.map((block) => block.kind)).toEqual([
			"prose", "figure", "prose", "figure", "prose", "figure", "prose", "figure",
		]);
		const [timeline, matrix, flow, chart] = figures(article);
		expect(timeline).toMatchObject({
			kind: "timeline",
			asAt: "2026-10-16",
			entries: [
				{ date: "2026-09-30", precision: "day", cite: "nsw-identifying-ai-guidance", detail: "All agencies must register their AI use cases." },
				{ date: "2026-10-20", precision: "day", cite: "fwc-genai-guidance-note" },
				{ date: "2026-11-16", precision: "day" },
				{ date: "2026-12-10", precision: "day" },
			],
		});
		expect(matrix).toMatchObject({
			kind: "matrix",
			wide: true,
			columns: ["Court", "Instrument", "Who it covers", "What it requires"],
		});
		if (matrix.kind !== "matrix") throw new Error("expected a matrix");
		expect(matrix.rows[1].cells[2]).toEqual({ kind: "text", text: expect.stringMatching(/^No generative AI/), emphasis: true });
		expect(matrix.rows[2].cells[1]).toEqual({ kind: "not_stated" });
		expect(matrix.rows[0]).toEqual({
			header: "Federal Court",
			cells: [
				{ kind: "text", text: "GPN-AI", emphasis: false },
				{ kind: "text", text: "Everyone who appears before or files documents with the Court", emphasis: false },
				{ kind: "text", text: "Disclosure of AI use may be required", emphasis: false },
			],
		});
		expect(flow).toMatchObject({
			kind: "flow",
			steps: [
				{ role: "decision" },
				{ role: "step", label: "Yes to any AI question" },
				{ role: "step" },
				{ role: "end" },
			],
			branch: { from: 1, label: "Yes to all non-AI questions", steps: [{ role: "end" }] },
		});
		expect(chart).toMatchObject({
			kind: "chart",
			query: { group: "jurisdiction", where: {} },
			highlight: "federal",
			sources: [],
		});
	});

	it("keeps month and year precision on timeline dates", () => {
		const article = parsed(inline("```figure\n" + TIMELINE + "\n```"));
		expect(figures(article)[0]).toMatchObject({
			entries: [
				{ date: "2026-03-01", precision: "month" },
				{ date: "2027-01-01", precision: "year" },
			],
		});
	});

	it.each([
		["unknown-kind", ["figure 1: kind must be one of timeline, matrix, flow, chart"]],
		["missing-title", ["figure 1: title is required"]],
		["missing-alt", ["figure 1: alt is required"]],
		["missing-caption", ["figure 1: caption is required"]],
		["long-title", ["figure 1: title must be at most 100 characters"]],
		["short-alt", ["figure 1: alt must be at least 20 characters"]],
		["timeline-count", ["figure 1: a timeline needs 2 to 7 entries"]],
		["matrix-count", ["figure 1: a matrix needs 2 to 5 columns", "figure 1: a matrix needs 2 to 9 rows"]],
		["flow-count", ["figure 1: a flow needs 3 to 6 steps, counting its branch"]],
		["chart-group", ["figure 1: group must be one of jurisdiction, type, status"]],
		[
			"source-unlisted",
			["figure 1: sources lists https://www.example.gov.au/another-instrument, which the piece's sources do not"],
		],
		["cite-unlisted", ["figure 1: cites fixture-other, which the piece's cites do not"]],
	])("rejects invalid-figure-%s", async (name, errors) => {
		expect(errorsOf(await fixture(`invalid-figure-${name}`))).toEqual(errors);
	});

	it("rejects a second branch and a branch from a step that is not a decision", () => {
		const steps = "steps:\n  - text: Check the instrument\n  - text: Apply it\n  - text: Record the result\n    role: end";
		const branch = "  from: 2\n  label: No\n  steps:\n    - text: Stop\n      role: end";
		expect(errorsOf(inline("```figure\n" + `${FLOW_FRAME}\n${steps}\nbranch:\n  - from: 1\n` + "```"))).toEqual([
			"figure 1: branch must be one { from, label, steps }; a flow has at most one branch",
		]);
		expect(errorsOf(inline("```figure\n" + `${FLOW_FRAME}\n${steps}\nbranch:\n${branch}\n` + "```"))).toEqual([
			"figure 1: branch.from must be the number of a decision step",
		]);
	});

	it("rejects wide on a timeline, cites on a chart, an unknown field and an empty matrix cell", () => {
		expect(errorsOf(inline("```figure\n" + TIMELINE.replace("asAt:", "wide: true\nasAt:") + "\n```"))).toEqual([
			"figure 1: wide is only for a matrix or a flow",
		]);
		const chart = TIMELINE.split("\nasAt")[0].replace("kind: timeline", "kind: chart");
		expect(errorsOf(inline("```figure\n" + `${chart}\ncites: [fixture-current]\ngroup: status\n` + "```"))).toEqual([
			"figure 1: a chart counts the public register as a whole and lists no cites",
		]);
		expect(errorsOf(inline("```figure\n" + TIMELINE + "\ncolour: red\n```"))).toEqual([
			'figure 1: unknown field "colour"',
		]);
		const matrix = `${TIMELINE.split("\nasAt")[0].replace("kind: timeline", "kind: matrix")}\ncolumns: [Instrument, Status]\nrows:\n  - [One, ""]\n  - [Two, ~]`;
		expect(errorsOf(inline("```figure\n" + matrix + "\n```"))).toEqual([
			"figure 1: rows[0] cell 2 is empty; write ~ for Not stated",
		]);
	});

	it("rejects a timeline entry cite that the figure does not list, and entries out of date order", () => {
		const unlisted = TIMELINE.replace("    title: Fixture instrument issued", "    title: Fixture instrument issued\n    cite: fixture-other");
		expect(errorsOf(inline("```figure\n" + unlisted + "\n```"))).toEqual([
			"figure 1: entries[0].cite fixture-other is not in the figure's cites",
		]);
		const reversed = TIMELINE.replace("date: 2026-03", "date: 2028-03");
		expect(errorsOf(inline("```figure\n" + reversed + "\n```"))).toEqual([
			"figure 1: timeline entries must be in date order",
		]);
	});

	it("rejects a chart query with an unknown where field or value", () => {
		const frame = TIMELINE.split("\nasAt")[0].replace("kind: timeline", "kind: chart").replace("\ncites: [fixture-current]", "");
		expect(errorsOf(inline("```figure\n" + `${frame}\ngroup: type\nwhere:\n  agency: dta\n  jurisdiction: [federal, mars]\nhighlight: nowhere\n` + "```"))).toEqual([
			'figure 1: where.agency is not a query field; use jurisdiction, type, status or effectiveDate',
			"figure 1: where.jurisdiction has unknown value mars",
			"figure 1: highlight must be a type value",
		]);
	});

	it("ignores a figure fence inside a longer code fence and rejects an unclosed figure", () => {
		const nested = "````md\n```figure\nkind: pie\n```\n````";
		expect(parsed(inline(nested)).blocks).toEqual([{ kind: "prose", markdown: nested }]);
		expect(errorsOf(inline("Text.\n\n```figure\n" + TIMELINE))).toEqual(["figure 1 is not closed with ```"]);
	});

	it("gives every prose block the piece's reference definitions", () => {
		const body = "See the [instrument][src].\n\n```figure\n" + TIMELINE + "\n```\n\nRead the [instrument][src] again.\n\n[src]: https://www.example.gov.au/fixture-instrument";
		const prose = parsed(inline(body)).blocks.flatMap((block) => (block.kind === "prose" ? [block.markdown] : []));
		expect(prose).toHaveLength(2);
		for (const markdown of prose) {
			expect(markdown).toContain("[src]: https://www.example.gov.au/fixture-instrument");
		}
	});
});

describe("registerChart", () => {
	const policy = (id: string, overrides: Partial<Policy>) => buildPolicy({ id, ...overrides });
	const register = [
		policy("f1", { jurisdiction: "federal", status: "active", effectiveDate: "2025-03-01" }),
		policy("f2", { jurisdiction: "federal", status: "proposed", effectiveDate: "2026-03-01" }),
		policy("f3", { jurisdiction: "federal", status: "active", type: "guideline", effectiveDate: "2026-05-01" }),
		policy("n1", { jurisdiction: "nsw", status: "closed", effectiveDate: "2024-01-01" }),
		policy("n2", { jurisdiction: "nsw", status: "active", effectiveDate: "2026-06-01" }),
		policy("v1", { jurisdiction: "vic", status: "active", effectiveDate: "2026-07-01" }),
		policy("q1", { jurisdiction: "qld", status: "active", effectiveDate: "2026-08-01" }),
	];
	const chart = (query: ChartFigure["query"], highlight?: string): ChartFigure => ({
		kind: "chart",
		title: "Federal instruments are the largest group",
		alt: "Bar chart of public register records by jurisdiction.",
		caption: "Public register records.",
		sources: [],
		query,
		...(highlight ? { highlight } : {}),
	});

	it("counts by jurisdiction, largest first, with ties in register order", () => {
		expect(registerChart(chart({ group: "jurisdiction", where: {} }, "federal"), register)).toEqual({
			total: 7,
			bars: [
				{ value: "federal", label: "Federal", count: 3, highlighted: true },
				{ value: "nsw", label: "New South Wales", count: 2, highlighted: false },
				{ value: "vic", label: "Victoria", count: 1, highlighted: false },
				{ value: "qld", label: "Queensland", count: 1, highlighted: false },
			],
		});
	});

	it("keeps status in its lifecycle order and applies where filters, including effective dates", () => {
		const result = registerChart(
			chart({ group: "status", where: { type: ["framework"], effectiveDate: { from: "2025-01-01", to: "2026-06-30" } } }),
			register,
		);
		expect(result).toEqual({
			total: 3,
			bars: [
				{ value: "proposed", label: "Proposed", count: 1, highlighted: false },
				{ value: "active", label: "Active", count: 2, highlighted: false },
			],
		});
	});
});
