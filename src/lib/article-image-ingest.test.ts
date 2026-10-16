/* @vitest-environment node */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import sharp, { type Sharp } from "sharp";
import { deflateSync } from "zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOWNLOAD_TIMEOUT_MS, ingestArticleImage } from "./article-image-ingest";
import { parseArticle } from "./articles";
import { COLLECTOR_USER_AGENT } from "./pipeline/identity";

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

function routes(table: Record<string, () => Response | Promise<Response>>) {
	return vi.fn(async (url: string | URL | Request) => {
		const handler = table[String(url)];
		if (!handler) throw new Error(`unexpected fetch of ${String(url)}`);
		return handler();
	});
}

const redirect = (location: string, status = 302) => () =>
	new Response(null, { status, headers: { location } });

function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

function pngHeaderOnly(width: number, height: number): Buffer {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		pngChunk("IHDR", header),
		pngChunk("IDAT", deflateSync(Buffer.alloc(16))),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

describe("ingestArticleImage", () => {
	it("re-encodes to a 2048px long edge, strips metadata and prints an empty-licence stub", async () => {
		const fetchImpl = source(await photo(4000, 3000, 1));
		const result = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl });

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

	it("downloads with the declared Policai identity User-Agent", async () => {
		const fetchImpl = source(await photo(3000, 2000));
		await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl });

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(URL_OK);
		const userAgent = new Headers(init?.headers).get("user-agent");
		expect(userAgent).toBe(COLLECTOR_USER_AGENT);
		expect(userAgent).toContain("Policai/1.0 (+https://policai.org)");
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

	describe("redirects", () => {
		it("follows a same-host https redirect", async () => {
			const fetchImpl = routes({
				[URL_OK]: redirect("/files/original.jpg", 301),
				"https://upload.example.org/files/original.jpg": async () => new Response(new Uint8Array(await photo(3000, 2000))),
			});
			const result = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl });
			expect([result.width, result.height]).toEqual([2048, 1365]);
			expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([URL_OK, "https://upload.example.org/files/original.jpg"]);
		});

		it.each([
			["to another host", "https://elsewhere.example.net/original.jpg"],
			["to a private address", "https://127.0.0.1/original.jpg"],
			["down to http on the same host", "http://upload.example.org/original.jpg"],
			["to another port on the same host", "https://upload.example.org:8443/original.jpg"],
		])("refuses a redirect %s and fetches nothing further", async (_name, location) => {
			const fetchImpl = routes({ [URL_OK]: redirect(location) });
			await expect(
				ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl }),
			).rejects.toThrow(
				`refusing the redirect from ${URL_OK} to ${new URL(location).href}; only same-host https redirects are followed, so pass the final image URL directly`,
			);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			expect(await readdir(publicDir)).toEqual([]);
		});

		it("refuses a redirect loop after five hops", async () => {
			const fetchImpl = routes({ [URL_OK]: redirect(URL_OK) });
			await expect(
				ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl }),
			).rejects.toThrow("more than 5 redirects");
			expect(fetchImpl).toHaveBeenCalledTimes(6);
		});
	});

	describe("a download that never finishes", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it(`is aborted after ${DOWNLOAD_TIMEOUT_MS / 1000}s`, async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const fetchImpl = vi.fn(
				(_url: string | URL | Request, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
					}),
			);
			const run = expect(
				ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl }),
			).rejects.toThrow(`the download did not finish within ${DOWNLOAD_TIMEOUT_MS / 1000}s`);
			await vi.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS - 1);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			await run;
		});
	});

	it("stops reading an endless body without content-length at 64 MB", async () => {
		const chunk = new Uint8Array(1024 * 1024);
		let pulled = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += chunk.byteLength;
				controller.enqueue(chunk);
			},
		});
		const fetchImpl = vi.fn(async () => new Response(body));
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl }),
		).rejects.toThrow(`the download exceeds the ${64 * 1024 * 1024}-byte limit`);
		expect(pulled).toBeLessThanOrEqual(66 * 1024 * 1024);
	});

	it("refuses a declared content-length over 64 MB without reading the body", async () => {
		const fetchImpl = source("x", { headers: { "content-length": String(64 * 1024 * 1024 + 1) } });
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl }),
		).rejects.toThrow(`the download is ${64 * 1024 * 1024 + 1} bytes; the limit is ${64 * 1024 * 1024}`);
	});

	it("refuses an image over 100 megapixels, below sharp's own default limit", async () => {
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(pngHeaderOnly(11000, 11000)) }),
		).rejects.toThrow("the download is not a readable image (Input image exceeds pixel limit)");
	});

	it.each([
		["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"><rect width="3000" height="2000" fill="red"/></svg>'), "svg"],
		["GIF", () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#456" } }).gif().toBuffer(), "gif"],
	])("refuses %s input", async (_name, input, format) => {
		const data = typeof input === "function" ? await input() : input;
		await expect(
			ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(data) }),
		).rejects.toThrow(`the download is ${format}; only jpeg, png, webp, tiff are accepted`);
		expect(await readdir(publicDir)).toEqual([]);
	});

	it.each([
		["PNG", (b: Sharp) => b.png()],
		["WebP", (b: Sharp) => b.webp()],
		["TIFF", (b: Sharp) => b.tiff()],
	])("accepts %s input", async (_name, encode) => {
		const data = await encode(sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#456" } })).toBuffer();
		const result = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(data) });
		expect([result.width, result.height]).toEqual([2048, 1365]);
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

	it("is idempotent under replace: a rerun writes the same bytes", async () => {
		const original = await photo(3000, 2000);
		const first = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(original) });
		const firstBytes = await readFile(first.file);
		const second = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(original), replace: true });
		expect((await readFile(second.file)).equals(firstBytes)).toBe(true);
	});

	describe("an existing image for the slug", () => {
		const slugDir = () => path.join(publicDir, "images", "articles", "a-piece");
		const leadFile = () => path.join(slugDir(), "lead.jpg");

		it("is never overwritten without replace, and the run leaves no other file", async () => {
			const first = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(3000, 2000)) });
			const firstBytes = await readFile(first.file);

			const rerun = ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(3000, 2000, 1)) });
			await expect(rerun).rejects.toThrow(
				`${leadFile()} already exists. Remove it and its frontmatter image attribution deliberately, or rerun with --replace and update the attribution to match the new image`,
			);
			expect((await readFile(leadFile())).equals(firstBytes)).toBe(true);
			expect(await readdir(slugDir())).toEqual(["lead.jpg"]);
		});

		it("is replaced with replace, leaving only the new file", async () => {
			await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(3000, 2000)) });
			const second = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(4000, 2000)), replace: true });

			expect([second.width, second.height]).toEqual([2048, 1024]);
			expect((await sharp(await readFile(leadFile())).metadata()).height).toBe(1024);
			expect(await readdir(slugDir())).toEqual(["lead.jpg"]);
		});

		it("is left intact, with no partial file, when the final write fails", async () => {
			await mkdir(leadFile(), { recursive: true });
			await writeFile(path.join(leadFile(), "keep"), "x");

			await expect(
				ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(3000, 2000)), replace: true }),
			).rejects.toThrow();
			expect(await readdir(slugDir())).toEqual(["lead.jpg"]);
			expect(await readdir(leadFile())).toEqual(["keep"]);
		});
	});

	it("writes a new image with no temporary file left behind", async () => {
		const result = await ingestArticleImage({ url: URL_OK, slug: "a-piece", publicDir, fetchImpl: source(await photo(3000, 2000)) });
		expect(await readdir(path.dirname(result.file))).toEqual(["lead.jpg"]);
	});
});
