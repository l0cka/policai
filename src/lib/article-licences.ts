import type { ArticleLicence } from "@/types";

interface LicenceRule {
	family: "CC0" | "PDM" | "CC-BY" | "CC-BY-SA";
	path: string;
	label: string;
	grant: string;
	versions: readonly string[];
	ports: Readonly<Record<string, readonly string[]>>;
}

const CREATIVE_COMMONS = "https://creativecommons.org";

const CC_VERSIONS = ["1.0", "2.0", "2.5", "3.0", "4.0"] as const;

const CC_PORTS = { AU: ["2.0", "2.1", "2.5", "3.0"] } as const;

export const ARTICLE_LICENCE_RULES: readonly LicenceRule[] = [
	{
		family: "CC0",
		path: "publicdomain/zero",
		label: "CC0",
		grant: "dedicated to the public domain under",
		versions: ["1.0"],
		ports: {},
	},
	{
		family: "PDM",
		path: "publicdomain/mark",
		label: "Public Domain Mark",
		grant: "marked with",
		versions: ["1.0"],
		ports: {},
	},
	{
		family: "CC-BY",
		path: "licenses/by",
		label: "CC BY",
		grant: "licensed under",
		versions: CC_VERSIONS,
		ports: CC_PORTS,
	},
	{
		family: "CC-BY-SA",
		path: "licenses/by-sa",
		label: "CC BY-SA",
		grant: "licensed under",
		versions: CC_VERSIONS,
		ports: CC_PORTS,
	},
];

export const ARTICLE_LICENCE_FORMS = `CC0-1.0, PDM-1.0, CC-BY-<version> or CC-BY-SA-<version> (versions ${CC_VERSIONS.join(", ")}; ${Object.entries(
	CC_PORTS,
)
	.map(([port, versions]) => `${port} ports ${versions.join(", ")} as CC-BY-${versions.at(-1)}-${port}`)
	.join("; ")})`;

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
	grant: string;
}

const LICENCE_ID = /^(CC0|PDM|CC-BY|CC-BY-SA)-(\d\.\d)(?:-([A-Z]{2}))?$/;

export function articleLicenceTerms(id: string): ArticleLicenceTerms | undefined {
	const match = LICENCE_ID.exec(id);
	if (!match) return undefined;
	const [, family, version, port] = match;
	const rule = ARTICLE_LICENCE_RULES.find((candidate) => candidate.family === family);
	if (!rule) return undefined;
	const versions = port ? rule.ports[port] : rule.versions;
	if (!versions?.includes(version)) return undefined;
	return {
		licence: id as ArticleLicence,
		licenceUrl: `${CREATIVE_COMMONS}/${rule.path}/${version}/${port ? `${port.toLowerCase()}/` : ""}`,
		label: `${rule.label} ${version}${port ? ` ${port}` : ""}`,
		grant: rule.grant,
	};
}
