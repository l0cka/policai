import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { THEMES } from '@/lib/themes';
import { JURISDICTIONS, type Development, type Policy } from '@/types';

const readJsonFile = vi.fn();
vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile: vi.fn() }));

function record(id: string, overrides: Partial<Policy> = {}): Policy {
	return buildPolicy({
		id,
		title: `${id} title`,
		jurisdiction: 'nsw',
		themes: ['privacy-data'],
		sourceUrl: `https://example.gov.au/${id}`,
		...overrides,
	});
}

function development(id: string, overrides: Partial<Development> = {}): Development {
	const url = `https://example.gov.au/news/${id}`;
	return {
		id,
		title: `${id} title`,
		url,
		sourceId: 'example',
		sourceName: 'Example',
		jurisdiction: 'nsw',
		detectedAt: '2026-10-10T01:00:00.000Z',
		relevanceScore: 0.5,
		classification: 'heuristic',
		verification: { status: 'needs_review', source: { url } },
		status: 'detected',
		...overrides,
	} as Development;
}

const POLICIES = [
	record('older-public', { updatedAt: '2026-03-01T00:00:00.000Z' }),
	record('newer-public', {
		title: 'Privacy & "AI" <draft> rules',
		updatedAt: '2026-09-01T00:00:00.000Z',
	}),
	record('other-theme', { themes: ['employment'] }),
	record('hidden-withheld'),
	record('hidden-unverified', {
		verification: { ...buildPolicy().verification, status: 'needs_review' },
	}),
	record('hidden-trashed', { status: 'trashed' }),
];

const DEVELOPMENTS = [
	development('machine-lead', { detectedAt: '2026-10-12T01:00:00.000Z' }),
	development('editor-checked', {
		title: 'Tribunal & court <AI> "practice" note',
		summary: 'Sets out when a party must disclose AI use.',
		detectedAt: '2026-10-11T01:00:00.000Z',
		verification: {
			status: 'verified',
			checkedAt: '2026-10-11T02:00:00.000Z',
			checkedBy: 'test-reviewer',
			method: 'manual',
			source: { url: 'https://example.gov.au/news/editor-checked', contentHash: 'a'.repeat(64) },
		},
	} as Partial<Development>),
	development('victorian-lead', { jurisdiction: 'vic' }),
	development('hidden-dismissed', { status: 'dismissed' }),
];

const WITHHOLDING_REVIEW = {
	id: 'review-1',
	status: 'pending_review',
	entryKind: 'policy',
	targetPolicyId: 'hidden-withheld',
	sourceUrl: 'https://example.gov.au/hidden-withheld',
	title: 'Changed source',
};

beforeEach(() => {
	vi.setSystemTime(new Date('2026-10-13T00:00:00.000Z'));
	readJsonFile.mockImplementation(async (file: string, fallback: unknown) => {
		if (file.endsWith('policies.json')) return structuredClone(POLICIES);
		if (file.endsWith('developments.json')) return structuredClone(DEVELOPMENTS);
		if (file.endsWith('source-reviews.json')) return [WITHHOLDING_REVIEW];
		return fallback;
	});
});

afterEach(() => {
	vi.useRealTimers();
});

type Route = {
	GET: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
};

async function fetchFeed(route: Promise<unknown>, params: Record<string, string>): Promise<Response> {
	const { GET } = (await route) as Route;
	return GET(new Request('https://policai.org/'), { params: Promise.resolve(params) });
}

const jurisdictionAtom = (jurisdiction: string) =>
	fetchFeed(import('./jurisdiction/[jurisdiction]/feed.xml/route'), { jurisdiction });
const jurisdictionJson = (jurisdiction: string) =>
	fetchFeed(import('./jurisdiction/[jurisdiction]/feed.json/route'), { jurisdiction });
const themeAtom = (theme: string) => fetchFeed(import('./theme/[theme]/feed.xml/route'), { theme });
const themeJson = (theme: string) => fetchFeed(import('./theme/[theme]/feed.json/route'), { theme });

function parseAtom(body: string): Document {
	const document = new DOMParser().parseFromString(body, 'application/xml');
	expect(document.querySelector('parsererror')).toBeNull();
	expect(document.documentElement.namespaceURI).toBe('http://www.w3.org/2005/Atom');
	return document;
}

function texts(document: Document, selector: string): string[] {
	return [...document.querySelectorAll(selector)].map((node) => node.textContent ?? '');
}

function links(document: Document, selector: string): string[] {
	return [...document.querySelectorAll(selector)].map((node) => node.getAttribute('href') ?? '');
}

interface JsonFeed {
	version: string;
	title: string;
	home_page_url: string;
	feed_url: string;
	items: Array<{
		id: string;
		url: string;
		external_url: string;
		title: string;
		content_text: string;
		date_published: string;
		date_modified: string;
		tags: string[];
	}>;
}

function expectValidJsonFeed(feed: JsonFeed, feedUrl: string) {
	expect(feed.version).toBe('https://jsonfeed.org/version/1.1');
	expect(feed.title).not.toBe('');
	expect(feed.feed_url).toBe(feedUrl);
	expect(feed.home_page_url).toMatch(/^https:\/\/policai\.org\//);
	for (const item of feed.items) {
		expect(item.id).not.toBe('');
		expect(item.content_text).not.toBe('');
		expect(item.url).toMatch(/^https:\/\//);
		expect(item.external_url).toMatch(/^https:\/\//);
		expect(new Date(item.date_published).toISOString()).toBe(item.date_published);
		expect(new Date(item.date_modified).toISOString()).toBe(item.date_modified);
	}
}

describe('jurisdiction feeds', () => {
	it('lists that jurisdiction\'s public developments, newest detection first, as well-formed Atom', async () => {
		const response = await jurisdictionAtom('nsw');
		const atom = parseAtom(await response.text());

		expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');
		expect(texts(atom, 'entry > title')).toEqual([
			'machine-lead title',
			'Tribunal & court <AI> "practice" note',
		]);
		expect(texts(atom, 'feed > id')).toEqual(['https://policai.org/feeds/jurisdiction/nsw/feed.xml']);
		expect(links(atom, 'feed > link[rel="self"]')).toEqual(['https://policai.org/feeds/jurisdiction/nsw/feed.xml']);
		expect(links(atom, 'feed > link[type="application/feed+json"]')).toEqual([
			'https://policai.org/feeds/jurisdiction/nsw/feed.json',
		]);
		expect(links(atom, 'entry > link[rel="related"]')).toEqual([
			'https://policai.org/developments#machine-lead',
			'https://policai.org/developments#editor-checked',
		]);
		expect(texts(atom, 'feed > updated')).toEqual(['2026-10-12T01:00:00.000Z']);
	});

	it('keeps "Needs review" on a machine detection and "Verified" on an editor-checked one', async () => {
		const atom = parseAtom(await (await jurisdictionAtom('nsw')).text());
		const categories = [...atom.querySelectorAll('entry')].map((entry) =>
			[...entry.querySelectorAll('category')].map((category) => category.getAttribute('term')),
		);
		expect(categories).toEqual([
			['New South Wales', 'Needs review'],
			['New South Wales', 'Verified'],
		]);

		const feed = (await (await jurisdictionJson('nsw')).json()) as JsonFeed;
		expect(feed.items.map((item) => item.tags)).toEqual(categories);
	});

	it('serves the same items as JSON Feed 1.1', async () => {
		const response = await jurisdictionJson('nsw');
		const feed = (await response.json()) as JsonFeed;

		expect(response.headers.get('Content-Type')).toBe('application/feed+json; charset=utf-8');
		expectValidJsonFeed(feed, 'https://policai.org/feeds/jurisdiction/nsw/feed.json');
		expect(feed.items.map((item) => item.title)).toEqual([
			'machine-lead title',
			'Tribunal & court <AI> "practice" note',
		]);
		expect(feed.items[1].content_text).toBe('Sets out when a party must disclose AI use.');
		expect(feed.items[0].external_url).toBe('https://policai.org/developments#machine-lead');
	});

	it('never carries a dismissed development or one from another jurisdiction', async () => {
		const bodies = await Promise.all([
			jurisdictionAtom('nsw').then((response) => response.text()),
			jurisdictionJson('nsw').then((response) => response.text()),
		]);
		for (const body of bodies) {
			expect(body).not.toContain('hidden-dismissed');
			expect(body).not.toContain('victorian-lead');
		}
	});

	it('stays a valid, empty feed for a jurisdiction with no developments', async () => {
		const atom = parseAtom(await (await jurisdictionAtom('nt')).text());
		expect(atom.querySelectorAll('entry')).toHaveLength(0);
		expect(texts(atom, 'feed > updated')).toEqual(['2026-10-13T00:00:00.000Z']);

		const feed = (await (await jurisdictionJson('nt')).json()) as JsonFeed;
		expectValidJsonFeed(feed, 'https://policai.org/feeds/jurisdiction/nt/feed.json');
		expect(feed.items).toEqual([]);
	});
});

describe('theme feeds', () => {
	it('lists public records on that theme, most recently updated first, linking the record and its source', async () => {
		const response = await themeAtom('privacy-data');
		const atom = parseAtom(await response.text());

		expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');
		expect(texts(atom, 'entry > title')).toEqual(['Privacy & "AI" <draft> rules', 'older-public title']);
		expect(links(atom, 'entry > link[rel="alternate"]')).toEqual([
			'https://policai.org/policies/newer-public',
			'https://policai.org/policies/older-public',
		]);
		expect(links(atom, 'entry > link[rel="related"]')).toEqual([
			'https://example.gov.au/newer-public',
			'https://example.gov.au/older-public',
		]);
		expect(texts(atom, 'entry > updated')).toEqual(['2026-09-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z']);
		expect(texts(atom, 'feed > updated')).toEqual(['2026-09-01T00:00:00.000Z']);
		expect(links(atom, 'feed > link[rel="self"]')).toEqual(['https://policai.org/feeds/theme/privacy-data/feed.xml']);
	});

	it('serves the same records as JSON Feed 1.1', async () => {
		const response = await themeJson('privacy-data');
		const feed = (await response.json()) as JsonFeed;

		expect(response.headers.get('Content-Type')).toBe('application/feed+json; charset=utf-8');
		expectValidJsonFeed(feed, 'https://policai.org/feeds/theme/privacy-data/feed.json');
		expect(feed.items.map((item) => item.id)).toEqual([
			'https://policai.org/policies/newer-public',
			'https://policai.org/policies/older-public',
		]);
		expect(feed.items[0].tags).toEqual(['New South Wales', 'Framework', 'Active']);
	});

	it('never carries a withheld, unverified or trashed record, or one on another theme', async () => {
		const bodies = await Promise.all([
			themeAtom('privacy-data').then((response) => response.text()),
			themeJson('privacy-data').then((response) => response.text()),
		]);
		for (const body of bodies) {
			expect(body).not.toMatch(/hidden-/);
			expect(body).not.toContain('other-theme');
		}
	});

	it('stays a valid, empty feed for a theme with no public records', async () => {
		const atom = parseAtom(await (await themeAtom('frontier-ai')).text());
		expect(atom.querySelectorAll('entry')).toHaveLength(0);

		const feed = (await (await themeJson('frontier-ai')).json()) as JsonFeed;
		expectValidJsonFeed(feed, 'https://policai.org/feeds/theme/frontier-ai/feed.json');
		expect(feed.items).toEqual([]);
	});
});

describe('feed routes', () => {
	it('prerender one feed per jurisdiction and per theme, and nothing else', async () => {
		const jurisdictionRoutes = await Promise.all([
			import('./jurisdiction/[jurisdiction]/feed.xml/route'),
			import('./jurisdiction/[jurisdiction]/feed.json/route'),
		]);
		const themeRoutes = await Promise.all([
			import('./theme/[theme]/feed.xml/route'),
			import('./theme/[theme]/feed.json/route'),
		]);
		for (const route of jurisdictionRoutes) {
			expect(route.dynamicParams).toBe(false);
			expect(route.generateStaticParams()).toEqual(JURISDICTIONS.map((jurisdiction) => ({ jurisdiction })));
		}
		for (const route of themeRoutes) {
			expect(route.dynamicParams).toBe(false);
			expect(route.generateStaticParams()).toEqual(THEMES.map(({ key }) => ({ theme: key })));
		}
	});

	it.each([
		['jurisdiction Atom', () => jurisdictionAtom('nz')],
		['jurisdiction JSON', () => jurisdictionJson('nz')],
		['theme Atom', () => themeAtom('not-a-theme')],
		['theme JSON', () => themeJson('not-a-theme')],
	])('answers 404 for an unknown %s key', async (_name, request) => {
		expect((await request()).status).toBe(404);
	});
});
