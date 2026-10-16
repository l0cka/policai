import { randomUUID } from "crypto";
import { link, mkdir, rename, rm, writeFile } from "fs/promises";
import path from "path";
import sharp, { type Metadata } from "sharp";
import {
	ARTICLE_IMAGE_MAX_BYTES,
	ARTICLE_IMAGE_MIN_LONG_EDGE,
} from "@/lib/article-images";
import { orientedSize } from "@/lib/article-image-files";
import { ARTICLE_IMAGE_ROOT, isArticleSlug } from "@/lib/articles";
import { COLLECTOR_USER_AGENT } from "@/lib/pipeline/identity";

export const ARTICLE_IMAGE_FILE_NAME = "lead.jpg";

export const ARTICLE_IMAGE_START_QUALITY = 82;

const QUALITY_STEP = 4;

const MIN_QUALITY = 70;

const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

const MAX_REDIRECTS = 5;

export const DOWNLOAD_TIMEOUT_MS = 30_000;

const SHARP_INPUT = { limitInputPixels: 100_000_000 };

const INPUT_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp", "tiff"]);

export interface IngestedArticleImage {
	src: string;
	file: string;
	width: number;
	height: number;
	bytes: number;
	quality: number;
	stub: string;
}

export interface IngestOptions {
	url: string;
	slug: string;
	publicDir: string;
	fetchImpl?: typeof fetch;
	replace?: boolean;
}

async function fetchSameHost(
	url: string,
	fetchImpl: typeof fetch,
	signal: AbortSignal,
): Promise<Response> {
	let current = new URL(url);
	if (current.protocol !== "https:") {
		throw new Error("the image URL must be https");
	}
	for (let hops = 0; ; hops++) {
		const response = await fetchImpl(current.href, {
			headers: { "User-Agent": COLLECTOR_USER_AGENT },
			redirect: "manual",
			signal,
		});
		if (response.status < 300 || response.status >= 400) return response;
		await response.body?.cancel();
		const location = response.headers.get("location");
		if (!location) throw new Error(`HTTP ${response.status} redirect has no Location header`);
		if (hops === MAX_REDIRECTS) throw new Error(`more than ${MAX_REDIRECTS} redirects`);
		const next = new URL(location, current);
		if (next.protocol !== "https:" || next.host !== current.host) {
			throw new Error(
				`refusing the redirect from ${current.href} to ${next.href}; only same-host https redirects are followed, so pass the final image URL directly`,
			);
		}
		current = next;
	}
}

async function readCapped(response: Response): Promise<Buffer> {
	const declared = Number(response.headers.get("content-length") ?? 0);
	if (declared > MAX_DOWNLOAD_BYTES) {
		throw new Error(`the download is ${declared} bytes; the limit is ${MAX_DOWNLOAD_BYTES}`);
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	if (!response.body) return Buffer.alloc(0);
	const reader = response.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return Buffer.concat(chunks, total);
		total += value.byteLength;
		if (total > MAX_DOWNLOAD_BYTES) {
			await reader.cancel();
			throw new Error(`the download exceeds the ${MAX_DOWNLOAD_BYTES}-byte limit`);
		}
		chunks.push(value);
	}
}

async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
	try {
		const response = await fetchSameHost(url, fetchImpl, controller.signal);
		if (!response.ok) {
			throw new Error(`download failed with HTTP ${response.status}`);
		}
		return await readCapped(response);
	} catch (error) {
		if (controller.signal.aborted) {
			throw new Error(`the download did not finish within ${DOWNLOAD_TIMEOUT_MS / 1000}s`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

async function writeAtomically(file: string, data: Buffer, replace: boolean): Promise<void> {
	const temp = path.join(
		path.dirname(file),
		`.${path.basename(file)}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(temp, data, { flag: "wx" });
		if (replace) {
			await rename(temp, file);
			return;
		}
		try {
			await link(temp, file);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			throw new Error(
				`${file} already exists. Remove it and its frontmatter image attribution deliberately, or rerun with --replace and update the attribution to match the new image`,
			);
		}
	} finally {
		await rm(temp, { force: true });
	}
}

export function articleImageStub(src: string, width: number, height: number): string {
	const field = (key: string, value: string | number) =>
		`  ${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`;
	return [
		"image:",
		field("src", src),
		field("alt", ""),
		field("width", width),
		field("height", height),
		field("title", ""),
		field("creator", ""),
		field("creatorUrl", ""),
		field("sourceUrl", ""),
		field("licence", ""),
		field("licenceUrl", ""),
		field("modifications", ""),
		field("licenceCheckedAt", ""),
	].join("\n");
}

export async function ingestArticleImage({
	url,
	slug,
	publicDir,
	fetchImpl = fetch,
	replace = false,
}: IngestOptions): Promise<IngestedArticleImage> {
	if (!isArticleSlug(slug)) {
		throw new Error(`slug "${slug}" must be lowercase kebab-case`);
	}
	const original = await download(url, fetchImpl);
	let metadata: Metadata;
	try {
		metadata = await sharp(original, SHARP_INPUT).metadata();
	} catch (error) {
		throw new Error(`the download is not a readable image (${(error as Error).message})`);
	}
	if (!INPUT_FORMATS.has(metadata.format ?? "")) {
		throw new Error(
			`the download is ${metadata.format ?? "an unknown format"}; only ${[...INPUT_FORMATS].join(", ")} are accepted`,
		);
	}
	const size = orientedSize(metadata);
	if (!size) throw new Error("the download is not a readable image");
	const longEdge = Math.max(size.width, size.height);
	if (longEdge < ARTICLE_IMAGE_MIN_LONG_EDGE) {
		throw new Error(
			`the original is ${longEdge}px on its long edge; at least ${ARTICLE_IMAGE_MIN_LONG_EDGE}px is required`,
		);
	}

	const resized = sharp(original, SHARP_INPUT).rotate().resize({
		width: ARTICLE_IMAGE_MIN_LONG_EDGE,
		height: ARTICLE_IMAGE_MIN_LONG_EDGE,
		fit: "inside",
		withoutEnlargement: true,
	});
	for (
		let quality = ARTICLE_IMAGE_START_QUALITY;
		quality >= MIN_QUALITY;
		quality -= QUALITY_STEP
	) {
		const { data, info } = await resized
			.clone()
			.jpeg({ quality, mozjpeg: true })
			.toBuffer({ resolveWithObject: true });
		if (data.length > ARTICLE_IMAGE_MAX_BYTES) continue;
		const src = `${ARTICLE_IMAGE_ROOT}/${slug}/${ARTICLE_IMAGE_FILE_NAME}`;
		const file = path.join(publicDir, ...src.split("/").filter(Boolean));
		await mkdir(path.dirname(file), { recursive: true });
		await writeAtomically(file, data, replace);
		return {
			src,
			file,
			width: info.width,
			height: info.height,
			bytes: data.length,
			quality,
			stub: articleImageStub(src, info.width, info.height),
		};
	}
	throw new Error(
		`the re-encoded image stays over ${ARTICLE_IMAGE_MAX_BYTES} bytes at quality ${MIN_QUALITY}; choose a simpler image`,
	);
}
