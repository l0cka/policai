import type { Article } from "@/types";

export const ARTICLE_IMAGE_MIN_LONG_EDGE = 2048;

export const ARTICLE_IMAGE_MAX_LONG_EDGE = 2560;

export const ARTICLE_IMAGE_MAX_BYTES = 1_200_000;

export interface ArticleImageFile {
	bytes: number;
	format?: string;
	width?: number;
	height?: number;
}

const FORMAT_BY_EXTENSION: Readonly<Record<string, string>> = {
	jpg: "jpeg",
	jpeg: "jpeg",
	png: "png",
	webp: "webp",
};

export type ArticleImageFiles = ReadonlyMap<string, ArticleImageFile>;

export function validateArticleImages(
	articles: ReadonlyMap<string, Article>,
	files: ArticleImageFiles,
): string[] {
	const errors: string[] = [];
	const referenced = new Set<string>();

	for (const [slug, article] of articles) {
		const image = article.image;
		if (!image) continue;
		const label = `data/articles/${slug}.md: image`;
		referenced.add(image.src);
		const file = files.get(image.src);
		if (!file) {
			errors.push(`${label} file ${image.src} does not exist under public/`);
			continue;
		}
		if (file.width === undefined || file.height === undefined) {
			errors.push(`${label} file ${image.src} is not a readable image`);
			continue;
		}
		const extension = image.src.slice(image.src.lastIndexOf(".") + 1);
		if (file.format !== FORMAT_BY_EXTENSION[extension]) {
			errors.push(
				`${label} file ${image.src} contains ${file.format} data but its extension is .${extension}`,
			);
		}
		if (file.width !== image.width || file.height !== image.height) {
			errors.push(
				`${label} declares ${image.width}x${image.height} but ${image.src} is ${file.width}x${file.height}`,
			);
		}
		const longEdge = Math.max(file.width, file.height);
		if (
			longEdge < ARTICLE_IMAGE_MIN_LONG_EDGE ||
			longEdge > ARTICLE_IMAGE_MAX_LONG_EDGE
		) {
			errors.push(
				`${label} long edge is ${longEdge}px; it must be ${ARTICLE_IMAGE_MIN_LONG_EDGE} to ${ARTICLE_IMAGE_MAX_LONG_EDGE}px`,
			);
		}
		if (file.bytes > ARTICLE_IMAGE_MAX_BYTES) {
			errors.push(
				`${label} file is ${file.bytes} bytes; the limit is ${ARTICLE_IMAGE_MAX_BYTES}`,
			);
		}
	}

	for (const src of files.keys()) {
		if (!referenced.has(src)) {
			errors.push(`public${src}: orphan image; no article's image.src uses it`);
		}
	}
	return errors;
}
