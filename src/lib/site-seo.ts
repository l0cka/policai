import type { Metadata } from 'next';
import {
	getJurisdictionName,
	getPolicyTypeName,
	type Policy,
} from '@/types';

export const SITE_URL = 'https://policai.org';
export const SITE_NAME = 'Policai';

/** Default document title — AU register, not general AI news. */
export const SITE_TITLE =
	'Policai · Australian AI policy register';

/**
 * Meta description aimed at policy officers, lawyers, researchers and
 * compliance/governance readers who need official instruments, not news.
 */
export const SITE_DESCRIPTION =
	'Curated register of Australian federal and state/territory AI policy, regulation, court guidance and developments. Every record links to its official source.';

export const SITE_KEYWORDS = [
	'Australian AI policy',
	'AI regulation Australia',
	'AI governance Australia',
	'court AI practice notes',
	'federal state territory AI policy',
] as const;

export const SITE_ATOM_FEEDS = [
	{ url: `${SITE_URL}/feed.xml`, title: 'Policai register feed' },
	{ url: `${SITE_URL}/analysis/feed.xml`, title: 'Policai analysis' },
] as const;

/** Canonical + both Atom feeds. Child metadata replaces layout alternates wholesale in Next 16, so every page that sets a canonical must restate the feeds. */
export function pageAlternates(canonical: string): NonNullable<Metadata['alternates']> {
	return {
		canonical,
		types: {
			'application/atom+xml': [...SITE_ATOM_FEEDS],
		},
	};
}

/**
 * Shared Open Graph / Twitter fields that are safe on the root layout.
 * Do not put title, description, or url here — Next inherits nested OG from
 * the layout onto every child that omits its own openGraph object.
 */
export const SITE_SOCIAL_DEFAULTS = {
	openGraph: {
		type: 'website' as const,
		locale: 'en_AU',
		siteName: SITE_NAME,
	},
	twitter: {
		card: 'summary_large_image' as const,
	},
};

/** The generated share card (`app/opengraph-image.tsx`). Pages that set their own openGraph lose the file-convention image, so they name it. */
export const SITE_SHARE_IMAGE = {
	url: `${SITE_URL}/opengraph-image`,
	width: 1200,
	height: 630,
	alt: `${SITE_NAME}, Australian AI policy register`,
};

/** Per-route OG/Twitter so habit pages do not inherit homepage title/url. */
export function pageSocialMeta(input: {
	title: string;
	description: string;
	/** Path beginning with `/`, or `/` for home. */
	path: string;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
	const url = input.path === '/' ? SITE_URL : `${SITE_URL}${input.path}`;
	return {
		openGraph: {
			...SITE_SOCIAL_DEFAULTS.openGraph,
			url,
			title: input.title,
			description: input.description,
			images: [SITE_SHARE_IMAGE],
		},
		twitter: {
			...SITE_SOCIAL_DEFAULTS.twitter,
			title: input.title,
			description: input.description,
			images: [SITE_SHARE_IMAGE],
		},
	};
}

function escapeJsonLd(value: string): string {
	return value.replace(/</g, '\\u003c');
}

/** WebSite + Organization for the homepage / root layout. */
export function siteJsonLd(): string {
	return escapeJsonLd(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@graph': [
				{
					'@type': 'WebSite',
					'@id': `${SITE_URL}/#website`,
					url: SITE_URL,
					name: SITE_NAME,
					description: SITE_DESCRIPTION,
					inLanguage: 'en-AU',
					publisher: { '@id': `${SITE_URL}/#organization` },
				},
				{
					'@type': 'Organization',
					'@id': `${SITE_URL}/#organization`,
					name: SITE_NAME,
					url: SITE_URL,
					description: SITE_DESCRIPTION,
				},
			],
		}),
	);
}

/** Truncate description for meta / OG (search engines typically show ~155–160). */
export function metaDescription(text: string, max = 160): string {
	const trimmed = text.replace(/\s+/g, ' ').trim();
	if (trimmed.length <= max) return trimmed;
	const cut = trimmed.slice(0, max - 1);
	const lastSpace = cut.lastIndexOf(' ');
	const body =
		lastSpace > Math.floor(max / 2) ? cut.slice(0, lastSpace) : cut;
	return `${body.trimEnd()}…`;
}

export function policyPageTitle(policy: Pick<Policy, 'title' | 'jurisdiction'>): string {
	const jurisdiction = getJurisdictionName(policy.jurisdiction);
	return `${policy.title} (${jurisdiction})`;
}

export function policyPageDescription(
	policy: Pick<Policy, 'description' | 'jurisdiction' | 'type'>,
): string {
	const jurisdiction = getJurisdictionName(policy.jurisdiction);
	const type = getPolicyTypeName(policy.type);
	const lead = policy.description?.trim() || `${type} in the Policai register.`;
	const withContext = lead.includes(jurisdiction)
		? lead
		: `${lead} ${jurisdiction} ${type.toLowerCase()}.`;
	return metaDescription(withContext);
}

/** CreativeWork + BreadcrumbList for a public register record. */
export function policyJsonLd(policy: Policy): string {
	const url = `${SITE_URL}/policies/${policy.id}`;
	const jurisdiction = getJurisdictionName(policy.jurisdiction);
	const type = getPolicyTypeName(policy.type);
	return escapeJsonLd(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@graph': [
				{
					'@type': 'CreativeWork',
					'@id': `${url}#record`,
					name: policy.title,
					description: policy.description,
					url,
					inLanguage: 'en-AU',
					dateModified:
						typeof policy.updatedAt === 'string'
							? policy.updatedAt
							: new Date(policy.updatedAt).toISOString(),
					isBasedOn: policy.sourceUrl,
					genre: type,
					spatialCoverage: {
						'@type': 'AdministrativeArea',
						name: jurisdiction === 'Federal' ? 'Australia' : jurisdiction,
					},
					about: {
						'@type': 'Thing',
						name: 'Artificial intelligence policy and governance',
					},
					publisher: {
						'@type': 'Organization',
						name: SITE_NAME,
						url: SITE_URL,
					},
				},
				{
					'@type': 'BreadcrumbList',
					itemListElement: [
						{
							'@type': 'ListItem',
							position: 1,
							name: 'Register',
							item: SITE_URL,
						},
						{
							'@type': 'ListItem',
							position: 2,
							name: jurisdiction,
							item: `${SITE_URL}/?jurisdiction=${policy.jurisdiction}`,
						},
						{
							'@type': 'ListItem',
							position: 3,
							name: policy.title,
							item: url,
						},
					],
				},
			],
		}),
	);
}
