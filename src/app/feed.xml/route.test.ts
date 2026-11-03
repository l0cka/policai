import { beforeEach, expect, it, vi } from 'vitest';
import type { Development } from '@/types';

const developments = [
	{
		id: 'dev-verified-1',
		title: 'OAIC issues commercial AI guidance',
		url: 'https://www.oaic.gov.au/example',
		sourceId: 'oaic',
		sourceName: 'OAIC',
		jurisdiction: 'federal',
		detectedAt: '2026-10-10T01:00:00.000Z',
		summary: 'Guidance for agencies using commercial AI products.',
		relevanceScore: 0.65,
		classification: 'heuristic',
		verification: { status: 'verified', source: { url: 'https://www.oaic.gov.au/example' } },
		status: 'detected',
	},
	{
		id: 'dev-radar-1',
		title: 'Senate opens AI inquiry',
		url: 'https://www.aph.gov.au/example',
		sourceId: 'aph',
		sourceName: 'Parliament',
		jurisdiction: 'federal',
		detectedAt: '2026-10-09T01:00:00.000Z',
		relevanceScore: 0.5,
		classification: 'heuristic',
		verification: { status: 'needs_review', source: { url: 'https://www.aph.gov.au/example' } },
		status: 'detected',
	},
	{
		id: 'dev-gone',
		title: 'Dismissed lead',
		url: 'https://www.example.gov.au/gone',
		sourceId: 'x',
		sourceName: 'Example',
		jurisdiction: 'nsw',
		detectedAt: '2026-10-08T01:00:00.000Z',
		relevanceScore: 0.4,
		classification: 'heuristic',
		verification: { status: 'needs_review', source: { url: 'https://www.example.gov.au/gone' } },
		status: 'dismissed',
	},
] as Development[];

vi.mock('@/lib/data-service', () => ({
	getDevelopments: vi.fn(async () => developments.filter((d) => d.status !== 'dismissed')),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

it('serves an Atom feed of public developments with on-site related links', async () => {
	const { GET } = await import('./route');
	const response = await GET();
	const body = await response.text();

	expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');
	expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
	expect(body).toContain('OAIC issues commercial AI guidance');
	expect(body).toContain('Senate opens AI inquiry');
	expect(body).not.toContain('Dismissed lead');
	expect(body).toContain('href="https://policai.org/developments#dev-verified-1"');
	expect(body).toContain('<category term="Verified"/>');
	expect(body).toContain('<category term="Needs review"/>');
	expect(body).toContain('/api/developments');
	expect(body).toContain('rel="self"/>');
});

it('asks for detection order and stamps the feed with the latest detection', async () => {
	const { getDevelopments } = await import('@/lib/data-service');
	const { GET } = await import('./route');
	vi.mocked(getDevelopments).mockResolvedValueOnce([
		{ ...developments[1], detectedAt: '2026-10-09T01:00:00.000Z' },
		{ ...developments[0], detectedAt: '2026-10-12T01:00:00.000Z' },
	] as Development[]);

	const body = await (await GET()).text();

	expect(getDevelopments).toHaveBeenCalledWith({ orderBy: 'detected' });
	expect(body).toMatch(/<\/id>\n  <updated>2026-10-12T01:00:00.000Z<\/updated>/);
});
