import { readdir, stat } from "fs/promises";
import path from "path";
import sharp from "sharp";
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

async function inspect(file: string): Promise<ArticleImageFile> {
	const { size } = await stat(file);
	try {
		const { width, height, orientation } = await sharp(file).metadata();
		if (!width || !height) return { bytes: size };
		return (orientation ?? 1) >= 5
			? { bytes: size, width: height, height: width }
			: { bytes: size, width, height };
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
