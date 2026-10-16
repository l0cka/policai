/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { articleLicenceTerms } from "./article-licences";
import { parseArticle } from "./articles";

const SLUG = "image-piece";

const IMAGE = {
	src: `/images/articles/${SLUG}/lead.jpg`,
	alt: "A courtroom with an empty bench",
	width: 2048,
	height: 1365,
	title: "Courtroom",
	creator: "Jane Citizen",
	creatorUrl: "https://commons.wikimedia.org/wiki/User:Jane",
	sourceUrl: "https://commons.wikimedia.org/wiki/File:Courtroom.jpg",
	licence: "CC-BY-SA-4.0",
	licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
	modifications: "cropped",
	licenceCheckedAt: "2026-10-16",
};

function source(image: Record<string, unknown> | undefined | "scalar"): string {
	const lines = [
		"type: explainer",
		"title: An illustrated piece",
		"summary: A piece with a lead image.",
		"status: draft",
	];
	if (image === "scalar") lines.push("image: nope");
	else if (image) lines.push(`image: ${JSON.stringify(image)}`);
	return `---\n${lines.join("\n")}\n---\n\nBody.\n`;
}

function errorsFor(image: Record<string, unknown> | "scalar"): string[] {
	const result = parseArticle({ slug: SLUG, source: source(image) });
	return result.ok ? [] : result.errors;
}

describe("parseArticle image", () => {
	it("parses a complete image into the typed value", () => {
		const result = parseArticle({ slug: SLUG, source: source(IMAGE) });
		expect(result).toMatchObject({ ok: true, article: { image: IMAGE } });
	});

	it("leaves image absent when the piece has none", () => {
		const result = parseArticle({ slug: SLUG, source: source(undefined) });
		expect(result.ok && "image" in result.article).toBe(false);
	});

	it("keeps creatorUrl and modifications optional", () => {
		const { creatorUrl: _creatorUrl, modifications: _modifications, ...minimal } = IMAGE;
		const result = parseArticle({ slug: SLUG, source: source(minimal) });
		expect(result.ok && result.article.image).toEqual(minimal);
	});

	it.each([
		["a scalar", "scalar", ["image must be an object"]],
		["an unknown field", { ...IMAGE, caption: "x" }, ["image.caption is not a known field"]],
		["a src outside the slug folder", { ...IMAGE, src: "/images/articles/other/lead.jpg" }, [`image.src must be /images/articles/${SLUG}/<file> with a jpg, png or webp file name`]],
		["a src with a gif file", { ...IMAGE, src: `/images/articles/${SLUG}/lead.gif` }, [`image.src must be /images/articles/${SLUG}/<file> with a jpg, png or webp file name`]],
		["a missing alt", { ...IMAGE, alt: "" }, ["image.alt is required and must be non-empty text"]],
		["a missing title", { ...IMAGE, title: undefined }, ["image.title is required and must be non-empty text"]],
		["a missing creator", { ...IMAGE, creator: " " }, ["image.creator is required and must be non-empty text"]],
		["a missing sourceUrl", { ...IMAGE, sourceUrl: undefined }, ["image.sourceUrl is required and must be non-empty text"]],
		["an http sourceUrl", { ...IMAGE, sourceUrl: "http://commons.wikimedia.org/wiki/File:C.jpg" }, ["image.sourceUrl must be an https URL"]],
		["an http creatorUrl", { ...IMAGE, creatorUrl: "http://example.org/jane" }, ["image.creatorUrl must be an https URL"]],
		["a fractional width", { ...IMAGE, width: 2048.5 }, ["image.width is required and must be a positive whole number of pixels"]],
		["a missing height", { ...IMAGE, height: undefined }, ["image.height is required and must be a positive whole number of pixels"]],
		["a missing licenceCheckedAt", { ...IMAGE, licenceCheckedAt: undefined }, ["image.licenceCheckedAt is required and must be a calendar date (YYYY-MM-DD)"]],
		["an impossible licenceCheckedAt", { ...IMAGE, licenceCheckedAt: "2026-02-30" }, ["image.licenceCheckedAt is required and must be a calendar date (YYYY-MM-DD)"]],
		["an NC licence", { ...IMAGE, licence: "CC-BY-NC-4.0", licenceUrl: "https://creativecommons.org/licenses/by-nc/4.0/" }, ["image.licence CC-BY-NC-4.0 is rejected; NC and ND licences are not allowed"]],
		["an ND licence", { ...IMAGE, licence: "CC-BY-ND-4.0", licenceUrl: "https://creativecommons.org/licenses/by-nd/4.0/" }, ["image.licence CC-BY-ND-4.0 is rejected; NC and ND licences are not allowed"]],
		["an unknown licence", { ...IMAGE, licence: "Unsplash" }, ["image.licence must be CC0-1.0, PDM-1.0, CC-BY-<version> or CC-BY-SA-<version>, not Unsplash"]],
		["a licenceUrl that does not match", { ...IMAGE, licenceUrl: "https://creativecommons.org/licenses/by/4.0/" }, ["image.licenceUrl must be https://creativecommons.org/licenses/by-sa/4.0/ for CC-BY-SA-4.0"]],
	] as const)("rejects %s", (_name, image, expected) => {
		expect(errorsFor(image as Record<string, unknown> | "scalar")).toEqual(expected);
	});
});

describe("articleLicenceTerms", () => {
	it.each([
		["CC0-1.0", "https://creativecommons.org/publicdomain/zero/1.0/", "CC0 1.0"],
		["PDM-1.0", "https://creativecommons.org/publicdomain/mark/1.0/", "Public Domain Mark 1.0"],
		["CC-BY-4.0", "https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0"],
		["CC-BY-3.0", "https://creativecommons.org/licenses/by/3.0/", "CC BY 3.0"],
		["CC-BY-SA-2.5", "https://creativecommons.org/licenses/by-sa/2.5/", "CC BY-SA 2.5"],
	])("maps %s to its canonical URL", (id, licenceUrl, label) => {
		expect(articleLicenceTerms(id)).toEqual({ licence: id, licenceUrl, label });
	});

	it.each(["CC-BY-NC-4.0", "CC-BY-ND-4.0", "CC-BY-NC-SA-4.0", "CC-BY-4", "CC0-2.0", "cc-by-4.0", ""])(
		"rejects %s",
		(id) => {
			expect(articleLicenceTerms(id)).toBeUndefined();
		},
	);
});
