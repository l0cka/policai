/* @vitest-environment node */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import sharp, { type Sharp } from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readArticleImageFiles } from "./article-image-files";
import { validateArticles } from "./validate-data";
import type { ArticleSource } from "./articles";
import { buildPolicy } from "@/test/factories";

const SLUG = "image-piece";
const SRC = `/images/articles/${SLUG}/lead.jpg`;

const frontmatter = (overrides: Record<string, unknown> = {}) => {
	const image = {
		src: SRC,
		alt: "A courtroom",
		width: 2048,
		height: 1365,
		title: "Courtroom",
		creator: "Jane Citizen",
		sourceUrl: "https://commons.wikimedia.org/wiki/File:Courtroom.jpg",
		licence: "CC-BY-4.0",
		licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
		licenceCheckedAt: "2026-10-16",
		...overrides,
	};
	return `---\ntype: explainer\ntitle: T\nsummary: S\nstatus: draft\nimage: ${JSON.stringify(image)}\n---\n\nBody.\n`;
};

const policy = buildPolicy({ id: "fixture-current" });
let publicDir: string;

async function put(file: string, data: Buffer | string) {
	const target = path.join(publicDir, "images/articles", file);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, data);
}

const jpeg = (width: number, height: number, quality = 80) =>
	sharp({ create: { width, height, channels: 3, background: "#456" } })
		.jpeg({ quality })
		.toBuffer();

async function errorsFor(
	source: string,
	setup: () => Promise<void>,
): Promise<string[]> {
	await rm(path.join(publicDir, "images"), { recursive: true, force: true });
	await setup();
	const entry: ArticleSource = { slug: SLUG, source };
	return validateArticles([entry], [], {
		policies: [policy],
		publicPolicies: [policy],
		images: await readArticleImageFiles(publicDir),
	}).errors;
}

beforeAll(async () => {
	publicDir = await mkdtemp(path.join(os.tmpdir(), "article-images-"));
});

afterAll(async () => {
	await rm(publicDir, { recursive: true, force: true });
});

describe("validateArticles images", () => {
	it("accepts a file in range with matching dimensions", async () => {
		expect(
			await errorsFor(frontmatter(), async () => put(`${SLUG}/lead.jpg`, await jpeg(2048, 1365))),
		).toEqual([]);
	});

	it("accepts a portrait file at the maximum long edge", async () => {
		expect(
			await errorsFor(
				frontmatter({ width: 1707, height: 2560 }),
				async () => put(`${SLUG}/lead.jpg`, await jpeg(1707, 2560)),
			),
		).toEqual([]);
	});

	it("rejects a missing file", async () => {
		expect(await errorsFor(frontmatter(), async () => undefined)).toEqual([
			`data/articles/${SLUG}.md: image file ${SRC} does not exist under public/`,
		]);
	});

	it("rejects a file that is not an image", async () => {
		expect(
			await errorsFor(frontmatter(), async () => put(`${SLUG}/lead.jpg`, "not an image")),
		).toEqual([`data/articles/${SLUG}.md: image file ${SRC} is not a readable image`]);
	});

	it("rejects a file whose format does not match its extension", async () => {
		const webp = await sharp({ create: { width: 2048, height: 1365, channels: 3, background: "#456" } })
			.webp()
			.toBuffer();
		expect(await errorsFor(frontmatter(), async () => put(`${SLUG}/lead.jpg`, webp))).toEqual([
			`data/articles/${SLUG}.md: image file ${SRC} contains webp data but its extension is .jpg`,
		]);
	});

	it.each([
		["lead.webp", (b: Sharp) => b.webp()],
		["lead.png", (b: Sharp) => b.png()],
		["lead.jpeg", (b: Sharp) => b.jpeg()],
	])("accepts %s holding its own format", async (file, encode) => {
		const data = await encode(sharp({ create: { width: 2048, height: 1365, channels: 3, background: "#456" } })).toBuffer();
		expect(
			await errorsFor(frontmatter({ src: `/images/articles/${SLUG}/${file}` }), async () => put(`${SLUG}/${file}`, data)),
		).toEqual([]);
	});

	it("rejects declared dimensions that differ from the file", async () => {
		expect(
			await errorsFor(
				frontmatter({ height: 1400 }),
				async () => put(`${SLUG}/lead.jpg`, await jpeg(2048, 1365)),
			),
		).toEqual([
			`data/articles/${SLUG}.md: image declares 2048x1400 but ${SRC} is 2048x1365`,
		]);
	});

	it("reads EXIF orientation when measuring dimensions", async () => {
		const rotated = await sharp(await jpeg(2048, 1365))
			.withMetadata({ orientation: 6 })
			.toBuffer();
		expect(
			await errorsFor(
				frontmatter({ width: 1365, height: 2048 }),
				async () => put(`${SLUG}/lead.jpg`, rotated),
			),
		).toEqual([]);
	});

	it.each([
		[2047, 1364],
		[2561, 1700],
	])("rejects a %i px long edge", async (width, height) => {
		expect(
			await errorsFor(
				frontmatter({ width, height }),
				async () => put(`${SLUG}/lead.jpg`, await jpeg(width, height)),
			),
		).toEqual([
			`data/articles/${SLUG}.md: image long edge is ${width}px; it must be 2048 to 2560px`,
		]);
	});

	it("rejects a file over 1.2 MB", async () => {
		const noise = await sharp(Buffer.alloc(2048 * 1365 * 3).map(() => Math.random() * 256), {
			raw: { width: 2048, height: 1365, channels: 3 },
		})
			.jpeg({ quality: 95 })
			.toBuffer();
		const errors = await errorsFor(frontmatter(), async () => put(`${SLUG}/lead.jpg`, noise));
		expect(errors).toEqual([
			`data/articles/${SLUG}.md: image file is ${noise.length} bytes; the limit is 1200000`,
		]);
	});

	it("rejects an orphan file, including one for an article without an image", async () => {
		const withoutImage = frontmatter().replace(/image: .*\n/, "");
		expect(
			await errorsFor(withoutImage, async () => put(`${SLUG}/lead.jpg`, await jpeg(2048, 1365))),
		).toEqual([`public${SRC}: orphan image; no article's image.src uses it`]);
	});

	it("rejects an orphan beside a referenced file", async () => {
		expect(
			await errorsFor(frontmatter(), async () => {
				await put(`${SLUG}/lead.jpg`, await jpeg(2048, 1365));
				await put("gone/old.jpg", await jpeg(2048, 1365));
			}),
		).toEqual(["public/images/articles/gone/old.jpg: orphan image; no article's image.src uses it"]);
	});

	it("passes when public has no article images directory", async () => {
		const withoutImage = frontmatter().replace(/image: .*\n/, "");
		expect(await errorsFor(withoutImage, async () => undefined)).toEqual([]);
	});
});
