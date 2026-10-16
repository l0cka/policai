import { readdir, stat } from "fs/promises";
import path from "path";
import sharp, { type Metadata } from "sharp";
import type { ArticleImageFile, ArticleImageFiles } from "@/lib/article-images";
import { ARTICLE_IMAGE_ROOT } from "@/lib/articles";

async function listFiles(dir: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const nested = await Promise.all(
		entries
			.filter((entry) => !entry.name.startsWith("."))
			.map((entry) =>
				entry.isDirectory()
					? listFiles(path.join(dir, entry.name))
					: Promise.resolve([path.join(dir, entry.name)]),
			),
	);
	return nested.flat();
}

export function orientedSize(
	metadata: Metadata,
): { width: number; height: number } | undefined {
	const { width, height, orientation } = metadata;
	if (!width || !height) return undefined;
	return (orientation ?? 1) >= 5
		? { width: height, height: width }
		: { width, height };
}

async function inspect(file: string): Promise<ArticleImageFile> {
	const { size } = await stat(file);
	try {
		const metadata = await sharp(file).metadata();
		return { bytes: size, format: metadata.format, ...orientedSize(metadata) };
	} catch {
		return { bytes: size };
	}
}

export async function readArticleImageFiles(
	publicDir: string,
): Promise<ArticleImageFiles> {
	const root = path.join(publicDir, ...ARTICLE_IMAGE_ROOT.split("/").filter(Boolean));
	const files = await listFiles(root);
	const entries = await Promise.all(
		files.map(async (file): Promise<[string, ArticleImageFile]> => [
			`${ARTICLE_IMAGE_ROOT}/${path.relative(root, file).split(path.sep).join("/")}`,
			await inspect(file),
		]),
	);
	return new Map(entries.sort(([a], [b]) => a.localeCompare(b)));
}
