import { readdir, readFile } from "fs/promises";
import path from "path";
import { isValidCalendarDate, sydneyCalendarDate } from "@/lib/calendar-date";
import { parseFrontmatter, type FrontmatterFile } from "@/lib/frontmatter";
import { isAllowedSourceHost, sourceUrlsEqual } from "@/lib/source-url";
import {
	ARTICLE_LICENCE_FORMS,
	articleLicenceTerms,
	disallowedImageHost,
} from "@/lib/article-licences";
import {
	ARTICLE_STATUSES,
	ARTICLE_TYPES,
	type Article,
	type ArticleCorrection,
	type ArticleImage,
	type Policy,
	type PublicArticle,
} from "@/types";

export const ARTICLE_BYLINE = "Policai";

export const ARTICLE_TIER_LABEL = "Analysis";

export const ARTICLE_DISCLOSURE =
	"This piece was researched and drafted with AI, checked against the official sources it cites, and published by Daniel Alkurdi as editor.";

export const ARTICLE_NOTICE =
	"This is general information and analysis, not legal advice. Check the official sources and get advice on your own circumstances before you act.";

const ARTICLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ARTICLE_IMAGE_ROOT = "/images/articles";

const ARTICLE_IMAGE_FILE = /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/;

const ARTICLE_IMAGE_FIELDS = new Set([
	"src",
	"alt",
	"width",
	"height",
	"title",
	"creator",
	"creatorUrl",
	"sourceUrl",
	"licence",
	"licenceUrl",
	"modifications",
	"licenceCheckedAt",
]);

const SITE_ORIGIN = "https://policai.org";

const ARTICLE_FIELDS = new Set([
	"type",
	"title",
	"summary",
	"status",
	"publishedAt",
	"updatedAt",
	"withdrawnAt",
	"withdrawnReason",
	"cites",
	"sources",
	"corrections",
	"image",
]);

const BODY_LINK_PATTERNS = [
	/\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)/g,
	/<((?:https?|mailto):[^>\s]+)>/g,
	/^\s{0,3}\[[^\]]+\]:\s*<?([^>\s]+)>?/gm,
];

export interface ArticleSource {
	slug: string;
	source: string;
}

export type ArticleParseResult =
	| { ok: true; article: Article }
	| { ok: false; errors: string[] };

export type ArticleBodyLink =
	| { kind: "policy"; href: string; policyId: string }
	| { kind: "site"; href: string }
	| { kind: "external"; href: string };

export type CitationState ="current" | "review_due" | "not_public";

export function citationState(
	publicPolicies: ReadonlyMap<string, Policy>,
	policyId: string,
): CitationState {
	const policy = publicPolicies.get(policyId);
	if (!policy) return "not_public";
	return policy.verification.status === "verified" ? "current" : "review_due";
}

export function articleEditorialDate(article: PublicArticle): string {
	return article.updatedAt ?? article.publishedAt;
}

export async function readArticleSources(dir: string): Promise<ArticleSource[]> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const files = names.filter((name) => name.endsWith(".md")).sort();
	return Promise.all(
		files.map(async (name) => ({
			slug: name.slice(0, -".md".length),
			source: await readFile(path.join(dir, name), "utf8"),
		})),
	);
}

function onSitePath(href: string): string | null {
	const absolute = /^[a-z][a-z\d+.-]*:/i.test(href);
	if (!absolute && !/^[/#]/.test(href)) return null;
	try {
		const url = new URL(href, SITE_ORIGIN);
		return url.origin === SITE_ORIGIN ? url.pathname : null;
	} catch {
		return null;
	}
}

function classifyLink(href: string): ArticleBodyLink {
	const sitePath = onSitePath(href);
	if (sitePath === null) return { kind: "external", href };
	const policy = /^\/policies\/([^/]+)/.exec(sitePath);
	return policy
		? { kind: "policy", href, policyId: decodeURIComponent(policy[1]) }
		: { kind: "site", href };
}

export function articleBodyLinks(body: string): ArticleBodyLink[] {
	return BODY_LINK_PATTERNS.flatMap((pattern) =>
		Array.from(body.matchAll(pattern), (match) => classifyLink(match[1])),
	);
}

function calendarDate(value: unknown): string | undefined {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	return typeof value === "string" && isValidCalendarDate(value)
		? value
		: undefined;
}

export function isArticleSlug(value: string): boolean {
	return ARTICLE_SLUG.test(value);
}

function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

function parseArticleImage(
	slug: string,
	raw: unknown,
	errors: string[],
): ArticleImage | undefined {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		errors.push("image must be an object");
		return undefined;
	}
	const data = raw as Record<string, unknown>;
	const problems: string[] = [];
	const fail = (message: string) => problems.push(`image.${message}`);

	for (const key of Object.keys(data)) {
		if (!ARTICLE_IMAGE_FIELDS.has(key)) fail(`${key} is not a known field`);
	}
	const required = (key: string): string | undefined => {
		const value = data[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		fail(`${key} is required and must be non-empty text`);
		return undefined;
	};
	const optional = (key: string): string | undefined => {
		if (data[key] === undefined) return undefined;
		return required(key);
	};
	const httpsUrl = (key: string, isRequired: boolean): string | undefined => {
		const value = isRequired ? required(key) : optional(key);
		if (value === undefined) return value;
		if (!isHttpsUrl(value)) {
			fail(`${key} must be an https URL`);
			return value;
		}
		const disallowed = disallowedImageHost(value);
		if (disallowed) fail(`${key} is on ${disallowed.host}, which is not allowed: ${disallowed.reason}`);
		return value;
	};
	const dimension = (key: string): number | undefined => {
		const value = data[key];
		if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
		fail(`${key} is required and must be a positive whole number of pixels`);
		return undefined;
	};

	const src = required("src");
	if (src !== undefined) {
		const prefix = `${ARTICLE_IMAGE_ROOT}/${slug}/`;
		if (!src.startsWith(prefix) || !ARTICLE_IMAGE_FILE.test(src.slice(prefix.length))) {
			fail(`src must be ${prefix}<file> with a jpg, png or webp file name`);
		}
	}
	const alt = required("alt");
	const width = dimension("width");
	const height = dimension("height");
	const title = required("title");
	const creator = required("creator");
	const creatorUrl = httpsUrl("creatorUrl", false);
	const sourceUrl = httpsUrl("sourceUrl", true);
	const modifications = optional("modifications");
	const licenceCheckedAt = calendarDate(data.licenceCheckedAt);
	if (!licenceCheckedAt) fail("licenceCheckedAt is required and must be a calendar date (YYYY-MM-DD)");
	else if (licenceCheckedAt > sydneyCalendarDate(new Date())) {
		fail(`licenceCheckedAt ${licenceCheckedAt} is in the future (Australia/Sydney)`);
	}

	const licenceId = required("licence");
	const licenceUrlValue = httpsUrl("licenceUrl", true);
	let terms: ReturnType<typeof articleLicenceTerms>;
	if (licenceId !== undefined) {
		terms = articleLicenceTerms(licenceId);
		if (!terms) {
			fail(
				/(^|-)(NC|ND)(-|$)/.test(licenceId)
					? `licence ${licenceId} is rejected; NC and ND licences are not allowed`
					: `licence must be ${ARTICLE_LICENCE_FORMS}, not ${licenceId}`,
			);
		} else if (licenceUrlValue !== undefined && licenceUrlValue !== terms.licenceUrl) {
			fail(`licenceUrl must be ${terms.licenceUrl} for ${licenceId}`);
		}
	}

	errors.push(...problems);
	if (
		problems.length > 0 ||
		!src || !alt || !width || !height || !title || !creator || !sourceUrl ||
		!terms || !licenceUrlValue || !licenceCheckedAt
	) {
		return undefined;
	}
	return {
		src,
		alt,
		width,
		height,
		title,
		creator,
		...(creatorUrl ? { creatorUrl } : {}),
		sourceUrl,
		licence: terms.licence,
		licenceUrl: terms.licenceUrl,
		...(modifications ? { modifications } : {}),
		licenceCheckedAt,
	};
}

export function parseArticle({ slug, source }: ArticleSource): ArticleParseResult {
	let file: FrontmatterFile;
	try {
		file = parseFrontmatter(source);
	} catch (error) {
		return {
			ok: false,
			errors: [`frontmatter is not valid YAML (${(error as Error).message})`],
		};
	}
	const data = file.data as Record<string, unknown>;
	const errors: string[] = [];

	if (!ARTICLE_SLUG.test(slug)) {
		errors.push(`slug "${slug}" must be lowercase kebab-case`);
	}
	for (const key of Object.keys(data)) {
		if (!ARTICLE_FIELDS.has(key)) errors.push(`unknown field "${key}"`);
	}

	const present = (key: string) => data[key] !== undefined;
	const text = (key: string): string | undefined => {
		const value = data[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (present(key)) errors.push(`${key} must be non-empty text`);
		return undefined;
	};
	const date = (key: string): string | undefined => {
		const value = calendarDate(data[key]);
		if (!value && present(key)) {
			errors.push(`${key} must be a calendar date (YYYY-MM-DD)`);
		}
		return value;
	};
	const oneOf = <T extends readonly string[]>(
		key: string,
		values: T,
	): T[number] | undefined => {
		const value = data[key];
		if (typeof value === "string" && values.includes(value)) return value;
		if (present(key)) errors.push(`${key} must be one of ${values.join(", ")}`);
		return undefined;
	};
	const list = (key: string): string[] => {
		const value = data[key];
		if (!present(key)) return [];
		if (
			!Array.isArray(value) ||
			!value.every((item) => typeof item === "string" && item.trim())
		) {
			errors.push(`${key} must be a list of non-empty text`);
			return [];
		}
		const items = value.map((item: string) => item.trim());
		if (new Set(items).size !== items.length) {
			errors.push(`${key} must not repeat an entry`);
		}
		return items;
	};

	for (const key of ["type", "status", "title", "summary"]) {
		if (!present(key)) errors.push(`${key} is required`);
	}

	const type = oneOf("type", ARTICLE_TYPES);
	const status = oneOf("status", ARTICLE_STATUSES);
	const title = text("title");
	const summary = text("summary");
	const publishedAt = date("publishedAt");
	const updatedAt = date("updatedAt");
	const withdrawnAt = date("withdrawnAt");
	const withdrawnReason = text("withdrawnReason");
	const cites = list("cites");
	const sources = list("sources");
	const body = file.content.trim();
	const image = present("image")
		? parseArticleImage(slug, data.image, errors)
		: undefined;

	sources.forEach((url, index) => {
		if (!isAllowedSourceHost(url)) {
			errors.push(
				`sources[${index}] must be an https URL on a .gov.au or allow-listed official host`,
			);
		}
	});

	for (const link of articleBodyLinks(body)) {
		if (link.kind === "policy" && !cites.includes(link.policyId)) {
			errors.push(`body links /policies/${link.policyId} but cites does not list it`);
		}
		if (
			link.kind === "external" &&
			!sources.some((url) => {
				try {
					return sourceUrlsEqual(url, link.href);
				} catch {
					return false;
				}
			})
		) {
			errors.push(`body links ${link.href} but sources does not list it`);
		}
	}

	const corrections: ArticleCorrection[] = [];
	if (present("corrections")) {
		const raw = data.corrections;
		if (!Array.isArray(raw)) {
			errors.push("corrections must be a list of { date, text }");
		} else {
			raw.forEach((entry: unknown, index) => {
				const record = (entry ?? {}) as Record<string, unknown>;
				const correctionDate = calendarDate(record.date);
				const correctionText =
					typeof record.text === "string" ? record.text.trim() : "";
				if (!correctionDate || !correctionText) {
					errors.push(
						`corrections[${index}] needs a calendar date and non-empty text`,
					);
					return;
				}
				corrections.push({ date: correctionDate, text: correctionText });
			});
		}
	}

	if (status === "draft" && corrections.length > 0) {
		errors.push("a draft cannot carry corrections; they start at publication");
	}
	if (status !== "withdrawn" && (present("withdrawnAt") || present("withdrawnReason"))) {
		errors.push("only a withdrawn piece can carry withdrawnAt or withdrawnReason");
	}

	if (status === "published" || status === "withdrawn") {
		if (!present("publishedAt")) errors.push(`a ${status} piece requires publishedAt`);
		if (cites.length === 0) {
			errors.push(`a ${status} piece must cite at least one register record`);
		}
		if (!body) errors.push(`a ${status} piece needs a body`);
		corrections.forEach((correction, index) => {
			if (publishedAt && correction.date < publishedAt) {
				errors.push(`corrections[${index}] is dated before publishedAt`);
			}
			const previous = corrections[index - 1];
			if (previous && correction.date < previous.date) {
				errors.push(`corrections[${index}] is out of order; corrections are appended by date`);
			}
		});
		if (publishedAt && updatedAt && updatedAt < publishedAt) {
			errors.push("updatedAt cannot be before publishedAt");
		}
	}

	if (status === "withdrawn") {
		if (!present("withdrawnReason")) errors.push("a withdrawn piece requires withdrawnReason");
		if (!present("withdrawnAt")) errors.push("a withdrawn piece requires withdrawnAt");
		if (publishedAt && withdrawnAt && withdrawnAt < publishedAt) {
			errors.push("withdrawnAt cannot be before publishedAt");
		}
	}

	if (errors.length > 0 || !type || !status || !title || !summary) {
		return { ok: false, errors };
	}

	const fields = {
		slug,
		type,
		title,
		summary,
		cites,
		sources,
		corrections,
		body,
		...(image ? { image } : {}),
		...(updatedAt ? { updatedAt } : {}),
	};

	if (status === "draft") {
		return {
			ok: true,
			article: { ...fields, status, ...(publishedAt ? { publishedAt } : {}) },
		};
	}
	if (status === "published" && publishedAt) {
		return { ok: true, article: { ...fields, status, publishedAt } };
	}
	if (status === "withdrawn" && publishedAt && withdrawnAt && withdrawnReason) {
		return {
			ok: true,
			article: { ...fields, status, publishedAt, withdrawnAt, withdrawnReason },
		};
	}
	return { ok: false, errors };
}
