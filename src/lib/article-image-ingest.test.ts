/* @vitest-environment node */

import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ingestArticleImage } from "./article-image-ingest";
import { parseArticle } from "./articles";

const URL_OK = "https://upload.example.org/original.jpg";

let publicDir: string;

beforeEach(async () => {
	publicDir = await mkdtemp(path.join(os.tmpdir(), "ingest-"));
});

afterEach(async () => {
	await rm(publicDir, { recursive: true, force: true });
});

function source(buffer: Buffer | string, init: ResponseInit = {}) {
	const body = typeof buffer === "string" ? buffer : new Uint8Array(buffer);
	return vi.fn(async () => new Response(body, init));
}

async function photo(width: number, height: number, orientation?: number) {
	const base = sharp({
		create: { width, height, channels: 3, background: "#456" },
	}).jpeg();
	return (orientation ? base.withMetadata({ orientation }) : base).toBuffer();
}

describe("ingestArticleImage", () => {
	it("re-encodes to a 2048px long edge, strips metadata and prints an empty-licence stub", async () => {
		const fetchImpl = source(await photo(4000, 3000, 1));
		const result = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl });

		expect(fetchImpl).toHaveBeenCalledWith(URL_OK);
		expect(result).toMatchObject({
			src: "/images/articles/a-piece/lead.jpg",
			width: 2048,
			height: 1536,
			quality: 82,
		});
		const written = await readFile(result.file);
		const meta = await sharp(written).metadata();
		expect([meta.width, meta.height]).toEqual([2048, 1536]);
		expect(meta.exif).toBeUndefined();
		expect(meta.orientation).toBeUndefined();
		expect(written.length).toBe(result.bytes);

		for (const key of ["alt", "title", "creator", "creatorUrl", "sourceUrl", "licence", "licenceUrl", "modifications", "licenceCheckedAt"]) {
			expect(result.stub).toContain(`  ${key}: ""`);
		}
		expect(result.stub).toContain("  width: 2048\n  height: 1536");
	});

	it("applies EXIF orientation before measuring and encoding", async () => {
		const result = await ingestArticleImage({
			url: URL_OK,
			slug: "a-piece",
			publicDir,
			fetchImpl: source(await photo(3000, 4000, 6)),
		});
		expect([result.width, result.height]).toEqual([2048, 1536]);
		expect((await sharp(await readFile(result.file)).metadata()).width).toBe(result.width);
	});

	it("produces a stub that fails validation until a person fills it in", async () => {
		const result = await ingestArticleImage({
			url: URL_OK,
			slug: "a-piece",
			publicDir,
			fetchImpl: source(await photo(2600, 2000)),
		});
		const parsed = parseArticle({
			slug: "a-piece",
			source: `---\ntype: explainer\ntitle: T\nsummary: S\nstatus: draft\n${result.stub}\n---\n`,
		});
		expect(parsed.ok).toBe(false);
	});

	it("refuses an original below 2048px on its long edge", async () => {
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(2047, 1500)) }),
		).rejects.toThrow("the original is 2047px on its long edge; at least 2048px is required");
	});

	it.each([
		["a non-https URL", "http://example.org/a.jpg", "the image URL must be https"],
	])("refuses %s", async (_name, url, message) => {
		await expect(
			ingestArticleImage({ url, slug: "a-piece", publicDir, fetchImpl: source("x") }),
		).rejects.toThrow(message);
	});

	it("refuses a bad slug, a failed download and a non-image", async () => {
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "Bad Slug", publicDir, fetchImpl: source("x") }),
		).rejects.toThrow('slug "Bad Slug" must be lowercase kebab-case');
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source("nope", { status: 404 }) }),
		).rejects.toThrow("download failed with HTTP 404");
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source("not an image") }),
		).rejects.toThrow("the download is not a readable image");
	});

	it("is idempotent: a rerun writes the same bytes", async () => {
		const original = await photo(3000, 2000);
		const first = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(original) });
		const firstBytes = await readFile(first.file);
		const second = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(original) });
		expect((await readFile(second.file)).equals(firstBytes)).toBe(true);
	});
});
