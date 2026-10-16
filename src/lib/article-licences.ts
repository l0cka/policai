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
