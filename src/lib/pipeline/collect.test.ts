/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchSource } from './sources';

const { hasAiProvider } = vi.hoisted(() => ({
  hasAiProvider: vi.fn(),
}));

vi.mock('@/lib/ai-client', () => ({ hasAiProvider }));

import { collect, emptyWatchState } from './collect';

const HTML_SOURCE: WatchSource = {
  id: 'test-html',
  name: 'Test HTML source',
  jurisdiction: 'federal',
  category: 'government',
  url: 'https://www.example.gov.au/news',
  kind: 'html-index',
  schedule: 'daily',
  enabled: true,
};

const RSS_SOURCE: WatchSource = {
  id: 'test-rss',
  name: 'Test RSS source',
  jurisdiction: 'federal',
  category: 'regulator',
  url: 'https://www.example.gov.au/rss',
  kind: 'rss',
  schedule: 'daily',
  enabled: true,
};

const INDEX_HTML = `
<html><body>
  <li>
    <a href="/news/ai-policy-framework">New AI policy framework released</a>
    <time datetime="2026-07-01">1 July 2026</time>
  </li>
  <li><a href="/news/seen-before">Existing AI governance standard update</a></li>
</body></html>
`;

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Consultation opens on AI assurance guidance</title>
    <link>https://www.example.gov.au/media/ai-assurance-consultation</link>
    <pubDate>Thu, 09 Jul 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>
`;

function fakeFetch(routes: Record<string, string | number>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.entries(routes).find(([route]) => url.startsWith(route));
    if (!match) return new Response('not found', { status: 404 });
    const [, body] = match;
    if (typeof body === 'number') {
      return new Response('error', { status: body });
    }
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('collect', () => {
  beforeEach(() => {
    hasAiProvider.mockReturnValue(false);
  });

  it('detects new items, skips seen URLs, and updates state', async () => {
    const state = emptyWatchState();
    state.seen['https://www.example.gov.au/news/seen-before'] = {
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      sourceId: 'test-html',
    };

    const result = await collect({
      sources: [HTML_SOURCE, RSS_SOURCE],
      state,
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/news/ai-policy-framework':
          '<html><body><h1>New AI policy framework released</h1></body></html>',
        'https://www.example.gov.au/news': INDEX_HTML,
        'https://www.example.gov.au/rss': RSS_XML,
        'https://www.example.gov.au/media/ai-assurance-consultation':
          '<html><body><h1>Consultation on AI assurance</h1></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    const urls = result.developments.map((d) => d.url).sort();
    expect(urls).toEqual([
      'https://www.example.gov.au/media/ai-assurance-consultation',
      'https://www.example.gov.au/news/ai-policy-framework',
    ]);

    // publishedAt from feed/date hints
    const rssItem = result.developments.find((d) => d.sourceId === 'test-rss');
    expect(rssItem?.publishedAt).toBe('2026-07-09');
    expect(rssItem?.classification).toBe('heuristic');
    expect(rssItem?.status).toBe('detected');

    // state updated for both new URLs, seen URL untouched
    expect(
      result.state.seen['https://www.example.gov.au/news/ai-policy-framework'],
    ).toBeTruthy();
    expect(Object.keys(result.state.seen)).toHaveLength(3);

    // meta updated
    expect(result.meta.lastCollectedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(result.meta.collector.lastRunSources).toEqual([
      'test-html',
      'test-rss',
    ]);
    expect(result.errors).toEqual([]);
  });

  it('tolerates per-source failures and reports them', async () => {
    const result = await collect({
      sources: [HTML_SOURCE, RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/news': 403,
        'https://www.example.gov.au/rss': RSS_XML,
        'https://www.example.gov.au/media/ai-assurance-consultation':
          '<html><body>page</body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('test-html');
    expect(result.developments).toHaveLength(1);
    expect(result.meta.collector.lastRunErrors).toHaveLength(1);
  });

  it('skips weekly sources checked recently', async () => {
    const weekly: WatchSource = { ...HTML_SOURCE, schedule: 'weekly' };
    const state = emptyWatchState();
    state.lastCheckedBySource[weekly.id] = '2026-07-08T00:00:00.000Z';

    const fetchImpl = fakeFetch({});
    const result = await collect({
      sources: [weekly],
      state,
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.developments).toEqual([]);
  });

  it('never returns policy writes and stages high-confidence items for review', async () => {
    const result = await collect({
      sources: [RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': RSS_XML,
        'https://www.example.gov.au/media/ai-assurance-consultation':
          '<html><body>page</body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
      minScoreForReview: 0.5,
    });

    expect(result.reviewCandidates).toHaveLength(1);
    expect(result.reviewCandidates[0]).toMatchObject({
      sourceUrl: 'https://www.example.gov.au/media/ai-assurance-consultation',
      status: 'pending_review',
      createdBy: 'collector',
    });
    // The result shape has no policies key at all — the registry is curated only.
    expect('policies' in result).toBe(false);
  });
});
