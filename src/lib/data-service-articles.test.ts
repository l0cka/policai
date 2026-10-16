/* @vitest-environment node */

import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPolicy } from "@/test/factories";
import type { Policy, SourceReview } from "@/types";

const readJsonFile = vi.fn();

vi.mock("@/lib/file-store", () => ({
	readJsonFile,
	writeJsonFile: vi.fn(),
}));

const cited = buildPolicy({ id: "fixture-current", title: "Fixture instrument" });

function serve(policies: Policy[], reviews: Partial<SourceReview>[] = []) {
	readJsonFile.mockImplementation(async (file: string, fallback: unknown) => {
		if (file.endsWith("policies.json")) return policies;
		if (file.endsWith("source-reviews.json")) return reviews;
		return fallback;
	});
}

async function load() {
	vi.resetModules();
	return import("./data-service");
}

describe("data-service articles", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"));
		vi.stubEnv(
			"POLICAI_ARTICLES_DIR",
			path.join(process.cwd(), "src/test/fixtures/articles"),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("serves published pieces only in the index, filtered by type and citation", async () => {
		serve([cited]);
		const { getArticles } = await load();
		const slugs = (await getArticles()).map((article) => article.slug);
		expect(slugs).toContain("fixture-weekly-published");
		expect(slugs).not.toContain("fixture-explainer-draft");
		expect(slugs).not.toContain("fixture-note-withdrawn");
		expect(slugs).not.toContain("invalid-published-no-cites");
		expect(
			(await getArticles({ type: "explainer" })).map((article) => article.slug),
		).not.toContain("fixture-weekly-published");
		expect(
			(await getArticles({ citing: "fixture-current" })).map((article) => article.slug),
		).toEqual(["fixture-tables-published", "fixture-weekly-published"]);
	});

	it("never serves a draft, and serves a withdrawn piece by slug", async () => {
		serve([cited]);
		const { getArticleBySlug } = await load();
		expect(await getArticleBySlug("fixture-explainer-draft")).toBeNull();
		expect(await getArticleBySlug("fixture-note-withdrawn")).toMatchObject({
			status: "withdrawn",
			withdrawnReason:
				"The note described a different instrument from the one it cited.",
		});
	});

	it("shows no banner while every cited record is current", async () => {
		serve([cited]);
		const { getArticleBySlug } = await load();
		expect(await getArticleBySlug("fixture-weekly-published")).toMatchObject({
			sourceUnderReview: false,
			citations: [
				{ policyId: "fixture-current", state: "current", title: "Fixture instrument" },
			],
		});
	});

	it("flags a cited record past its review interval", async () => {
		serve([
			{
				...cited,
				verification: { ...cited.verification, checkedAt: "2026-01-01T00:00:00.000Z" },
			},
		]);
		const { getArticleBySlug } = await load();
		expect(await getArticleBySlug("fixture-weekly-published")).toMatchObject({
			sourceUnderReview: true,
			citations: [{ policyId: "fixture-current", state: "review_due" }],
		});
	});

	it("flags a withheld cited record without exposing its title", async () => {
		serve(
			[cited],
			[
				{
					id: "fixture-review",
					status: "pending_review",
					entryKind: "policy",
					targetPolicyId: cited.id,
					sourceUrl: cited.sourceUrl,
				},
			],
		);
		const { getArticleBySlug } = await load();
		const article = await getArticleBySlug("fixture-weekly-published");
		expect(article?.sourceUnderReview).toBe(true);
		expect(article?.citations).toEqual([
			{ policyId: "fixture-current", state: "not_public" },
		]);
	});
});
