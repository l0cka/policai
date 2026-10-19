import { describe, expect, it } from 'vitest';
import {
	metaDescription,
	pageSocialMeta,
	policyJsonLd,
	policyPageDescription,
	policyPageTitle,
	SITE_DESCRIPTION,
	SITE_SOCIAL_DEFAULTS,
	SITE_TITLE,
	siteJsonLd,
} from './site-seo';
import type { Policy } from '@/types';

function policy(overrides: Partial<Policy> = {}): Policy {
	return {
		id: 'oaic-guidance-commercial-ai-products',
		title: 'OAIC guidance on privacy and commercial AI products',
		description:
			'OAIC guidance for organisations deploying commercial AI products consistently with the Privacy Act and APPs.',
		jurisdiction: 'federal',
		type: 'guideline',
		status: 'active',
		effectiveDate: '2024-10-21',
		dates: [{ type: 'published', date: '2024-10-21', precision: 'day', primary: true }],
		agencies: ['oaic'],
		sourceUrl: 'https://www.oaic.gov.au/example',
		content: '',
		aiSummary: '',
		tags: ['privacy'],
		themes: ['privacy-data'],
		createdAt: '2024-10-21T00:00:00.000Z',
		updatedAt: '2026-10-01T00:00:00.000Z',
		verification: {
			status: 'verified',
			source: { url: 'https://www.oaic.gov.au/example' },
			method: 'manual',
			checkedAt: '2026-10-01T00:00:00.000Z',
			checkedBy: 'test',
		},
		...overrides,
	};
}

describe('siteJsonLd', () => {
	it('emits WebSite and Organization for en-AU', () => {
		const parsed = JSON.parse(siteJsonLd()) as {
			'@graph': Array<Record<string, unknown>>;
		};
		expect(parsed['@graph'].map((node) => node['@type'])).toEqual([
			'WebSite',
			'Organization',
		]);
		expect(parsed['@graph'][0]).toMatchObject({
			inLanguage: 'en-AU',
			description: SITE_DESCRIPTION,
		});
	});
});

describe('pageSocialMeta', () => {
	it('omits page title/url/description from layout-safe defaults', () => {
		expect(SITE_SOCIAL_DEFAULTS.openGraph).not.toHaveProperty('title');
		expect(SITE_SOCIAL_DEFAULTS.openGraph).not.toHaveProperty('url');
		expect(SITE_SOCIAL_DEFAULTS.openGraph).not.toHaveProperty('description');
		expect(SITE_SOCIAL_DEFAULTS.twitter).not.toHaveProperty('title');
		expect(SITE_SOCIAL_DEFAULTS.twitter).not.toHaveProperty('description');
	});

	it('sets per-route OG title and url so habit pages do not inherit home', () => {
		const social = pageSocialMeta({
			title: 'This week in Australian AI policy',
			description: 'Weekly verified developments.',
			path: '/this-week',
		});
		expect(social.openGraph).toMatchObject({
			title: 'This week in Australian AI policy',
			url: 'https://policai.org/this-week',
			description: 'Weekly verified developments.',
			locale: 'en_AU',
		});
		expect(social.openGraph?.title).not.toBe(SITE_TITLE);
	});
});

describe('policy page SEO helpers', () => {
	it('puts jurisdiction in the title for SERP clarity', () => {
		expect(policyPageTitle(policy())).toBe(
			'OAIC guidance on privacy and commercial AI products (Federal)',
		);
	});

	it('appends jurisdiction and type when the description omits them', () => {
		expect(policyPageDescription(policy())).toContain('Federal');
		expect(policyPageDescription(policy())).toMatch(/guideline/i);
	});

	it('truncates long descriptions without cutting mid-word when possible', () => {
		const long = 'alpha beta gamma delta epsilon zeta eta theta';
		const result = metaDescription(long, 28);
		expect(result.endsWith('…')).toBe(true);
		expect(result.length).toBeLessThanOrEqual(29);
		// Ends on a whole token, not e.g. "epsil…"
		expect(result).toMatch(/(?:alpha|beta|gamma|delta)…$/);
		expect(result).not.toMatch(/epsil…/);
	});

	it('emits CreativeWork and BreadcrumbList JSON-LD', () => {
		const parsed = JSON.parse(policyJsonLd(policy())) as {
			'@graph': Array<Record<string, unknown>>;
		};
		expect(parsed['@graph'][0]).toMatchObject({
			'@type': 'CreativeWork',
			isBasedOn: 'https://www.oaic.gov.au/example',
			genre: 'Guideline',
		});
		expect(parsed['@graph'][1]).toMatchObject({ '@type': 'BreadcrumbList' });
		expect(policyJsonLd(policy())).not.toContain('<');
	});
});
