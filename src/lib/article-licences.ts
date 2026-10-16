import type { ArticleLicence } from "@/types";

interface LicenceRule {
	pattern: RegExp;
	licenceUrl: (version: string) => string;
	label: (version: string) => string;
}

const CREATIVE_COMMONS = "https://creativecommons.org";

export const ARTICLE_LICENCE_RULES: readonly LicenceRule[] = [
	{
		pattern: /^CC0-1\.0$/,
		licenceUrl: () => `${CREATIVE_COMMONS}/publicdomain/zero/1.0/`,
		label: () => "CC0 1.0",
	},
	{
		pattern: /^PDM-1\.0$/,
		licenceUrl: () => `${CREATIVE_COMMONS}/publicdomain/mark/1.0/`,
		label: () => "Public Domain Mark 1.0",
	},
	{
		pattern: /^CC-BY-(\d\.\d)$/,
		licenceUrl: (version) => `${CREATIVE_COMMONS}/licenses/by/${version}/`,
		label: (version) => `CC BY ${version}`,
	},
	{
		pattern: /^CC-BY-SA-(\d\.\d)$/,
		licenceUrl: (version) => `${CREATIVE_COMMONS}/licenses/by-sa/${version}/`,
		label: (version) => `CC BY-SA ${version}`,
	},
];

export interface DisallowedImageHost {
	host: string;
	reason: string;
}

export const DISALLOWED_IMAGE_HOSTS: readonly DisallowedImageHost[] = [
	{ host: "unsplash.com", reason: "the Unsplash Licence is not a Creative Commons licence" },
	{ host: "pexels.com", reason: "the Pexels Licence is not a Creative Commons licence" },
];

export function disallowedImageHost(url: string): DisallowedImageHost | undefined {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.replace(/\.$/, "");
	} catch {
		return undefined;
	}
	return DISALLOWED_IMAGE_HOSTS.find(
		({ host }) => hostname === host || hostname.endsWith(`.${host}`),
	);
}

export interface ArticleLicenceTerms {
	licence: ArticleLicence;
	licenceUrl: string;
	label: string;
}

export function articleLicenceTerms(id: string): ArticleLicenceTerms | undefined {
	for (const rule of ARTICLE_LICENCE_RULES) {
		const match = rule.pattern.exec(id);
		if (match) {
			const version = match[1] ?? "";
			return {
				licence: id as ArticleLicence,
				licenceUrl: rule.licenceUrl(version),
				label: rule.label(version),
			};
		}
	}
	return undefined;
}

export function articleLicenceLabel(licence: ArticleLicence): string {
	return articleLicenceTerms(licence)?.label ?? licence;
}
