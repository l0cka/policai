/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { WatchSource } from './sources';

const { hasAiProvider } = vi.hoisted(() => ({
  hasAiProvider: vi.fn(),
}));

vi.mock('@/lib/ai-client', () => ({ hasAiProvider }));

import { collect, collectionRunFailed, emptyWatchState } from './collect';

describe('collection CLI failure policy', () => {
  it('fails targeted diagnostics when any source error is reported', () => {
    expect(collectionRunFailed('degraded', ['candidate failed'], true)).toBe(
      true,
    );
    expect(collectionRunFailed('healthy', [], true)).toBe(false);
  });

  it('fails global runs only when coverage health is failed', () => {
    expect(collectionRunFailed('failed', [], false)).toBe(true);
    expect(collectionRunFailed('degraded', ['one source failed'], false)).toBe(
      false,
    );
  });
});

const HTML_SOURCE: WatchSource = {
  id: 'test-html',
  name: 'Test HTML source',
  jurisdiction: 'federal',
  category: 'government',
  url: 'https://www.example.gov.au/news',
  kind: 'html-index',
  schedule: 'daily',
  enabled: true,
  automation: 'automatic',
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
  automation: 'automatic',
};

const DOCUMENT_SOURCE: WatchSource = {
  id: 'test-document',
  name: 'Test AI governance policy',
  jurisdiction: 'federal',
  category: 'government',
  url: 'https://www.example.gov.au/policy/ai-governance',
  kind: 'document',
  schedule: 'weekly',
  enabled: true,
  automation: 'automatic',
};

const INDEX_HTML = `
<html><body>
  <main><ul class="news-list">
    <li>
      <a href="/news/ai-policy-framework">New AI policy framework released</a>
      <time datetime="2026-07-01">1 July 2026</time>
    </li>
    <li><a href="/news/seen-before">Existing AI governance standard update</a></li>
  </ul></main>
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

type FakeRoute =
  | string
  | number
  | {
      body: BodyInit;
      contentType: string;
    };

function fakeFetch(routes: Record<string, FakeRoute>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.entries(routes)
      .sort(([a], [b]) => b.length - a.length)
      .find(([route]) => url.startsWith(route));
    if (!match) return new Response('not found', { status: 404 });
    const [, body] = match;
    if (typeof body === 'number') {
      return new Response('error', { status: body });
    }
    if (typeof body === 'object') {
      return new Response(body.body, {
        status: 200,
        headers: { 'content-type': body.contentType },
      });
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
    expect(result.meta.collector.sourceResults[0]).toMatchObject({
      itemCount: 2,
      candidateCount: 2,
    });
    expect(result.meta.collector.automaticSourceCount).toBe(54);
    expect(result.meta.collector.manualSourceCount).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('does not fingerprint document attachments while retrieving a discovery index', async () => {
    const attachmentLinks = Array.from(
      { length: 9 },
      (_, index) =>
        `<li><a href="/files/attachment-${index + 1}.pdf">Annual report attachment ${index + 1}</a></li>`,
    ).join('');
    const fetchImpl = fakeFetch({
      [HTML_SOURCE.url]: `<html><body><main><ul class="publication-list">${attachmentLinks}</ul></main></body></html>`,
    });

    const result = await collect({
      sources: [HTML_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.meta.collector.sourceResults[0].status).toBe('success');
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
          '<html><body>Official AI assurance consultation details.</body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('test-html');
    expect(result.developments).toHaveLength(1);
    expect(result.meta.collector.lastRunErrors).toHaveLength(1);
    expect(result.meta.collector.health).toBe('failed');
    expect(result.meta.lastHealthyAt).toBeNull();
  });

  it('treats an index redirect to the site homepage as failed coverage', async () => {
    const homepage = 'https://www.example.gov.au/';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === HTML_SOURCE.url) {
        return new Response(null, {
          status: 302,
          headers: { location: homepage },
        });
      }
      return new Response(
        '<main><ul><li><a href="/news/ai-policy">AI policy update</a></li></ul></main>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    }) as unknown as typeof fetch;

    const result = await collect({
      sources: [HTML_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors[0]).toContain('site homepage');
    expect(result.meta.collector.sourceResults[0].status).toBe('error');
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

  it('forces an explicitly targeted source regardless of schedule', async () => {
    const weekly: WatchSource = { ...HTML_SOURCE, schedule: 'weekly' };
    const state = emptyWatchState();
    state.lastCheckedBySource[weekly.id] = '2026-07-09T00:00:00.000Z';
    const fetchImpl = fakeFetch({
      [weekly.url]: INDEX_HTML,
      'https://www.example.gov.au/news/ai-policy-framework':
        '<html><body><h1>New AI policy framework released</h1></body></html>',
      'https://www.example.gov.au/news/seen-before':
        '<html><body><h1>Existing AI governance standard update</h1></body></html>',
    });

    const result = await collect({
      sources: [weekly],
      state,
      existingDevelopments: [],
      force: true,
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.meta.collector.dueSourceCount).toBe(1);
    expect(result.meta.collector.sourceResults[0].status).toBe('success');
  });

  it('never returns policy writes and stages high-confidence items for review', async () => {
    const result = await collect({
      sources: [RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': RSS_XML,
        'https://www.example.gov.au/media/ai-assurance-consultation':
          '<html><body>Official AI assurance consultation details.</body></html>',
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

  it('does not rediscover canonical or staged source URL variants', async () => {
    const trackedUrl =
      'https://www.example.gov.au/media/ai-assurance-consultation';
    const state = emptyWatchState();
    state.seen[trackedUrl] = {
      firstSeenAt: '2026-07-09T00:00:00.000Z',
      sourceId: RSS_SOURCE.id,
      status: 'pending',
      candidate: {
        title: 'Consultation on AI assurance',
        url: trackedUrl,
        text: 'AI assurance consultation',
      },
    };

    const result = await collect({
      sources: [RSS_SOURCE],
      state,
      existingDevelopments: [],
      trackedUrls: [`${trackedUrl}/?utm_source=mail#summary`],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': RSS_XML,
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.developments).toEqual([]);
    expect(result.reviewCandidates).toEqual([]);
    expect(result.state.seen[trackedUrl].status).toBe('dismissed');
  });

  it('keeps a candidate pending when its source page cannot be retrieved', async () => {
    const url =
      'https://www.example.gov.au/media/ai-assurance-consultation';
    const result = await collect({
      sources: [RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': RSS_XML,
        [url]: 503,
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.developments).toEqual([]);
    expect(result.reviewCandidates).toEqual([]);
    expect(result.state.seen[url]).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    expect(result.state.seen[url].lastError).toContain('HTTP 503');
    expect(result.meta.collector.health).toBe('failed');
  });

  it('does not count candidates outside the official-source allow-list as healthy coverage', async () => {
    const externalUrl = 'https://example.com/news/ai-policy-framework';
    const fetchImpl = fakeFetch({
      [HTML_SOURCE.url]: `<html><body><main><ul class="news-list"><li><a href="${externalUrl}">New AI policy framework released</a></li></ul></main></body></html>`,
    });

    const result = await collect({
      sources: [HTML_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.developments).toEqual([]);
    expect(result.state.seen).toEqual({});
    expect(result.meta.collector.sourceResults[0]).toMatchObject({
      status: 'error',
      itemCount: 0,
      candidateCount: 0,
    });
    expect(result.errors[0]).toContain(
      'Source returned no extractable index or feed items',
    );
  });

  it('makes permanent retrieval failures terminal instead of retrying forever', async () => {
    const url =
      'https://www.example.gov.au/media/ai-assurance-consultation';
    const result = await collect({
      sources: [RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': RSS_XML,
        [url]: 404,
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.state.seen[url]).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'HTTP 404',
    });
  });

  it('stops retrying transient candidate failures after five attempts', async () => {
    const url =
      'https://www.example.gov.au/news/persistently-unavailable-ai-policy';
    const state = emptyWatchState();
    state.seen[url] = {
      firstSeenAt: '2026-07-01T00:00:00.000Z',
      sourceId: HTML_SOURCE.id,
      status: 'pending',
      attempts: 4,
      candidate: {
        title: 'Persistently unavailable AI policy',
        url,
        text: 'AI policy',
      },
    };

    const result = await collect({
      sources: [HTML_SOURCE],
      state,
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [HTML_SOURCE.url]: 503,
        [url]: 503,
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.state.seen[url]).toMatchObject({
      status: 'failed',
      attempts: 5,
      lastError: 'HTTP 503',
    });
  });

  it('retries pending candidates even when the due source index fails', async () => {
    const pendingUrl =
      'https://www.example.gov.au/news/recovered-ai-policy';
    const state = emptyWatchState();
    state.seen[pendingUrl] = {
      firstSeenAt: '2026-07-09T00:00:00.000Z',
      sourceId: HTML_SOURCE.id,
      status: 'pending',
      attempts: 1,
      candidate: {
        title: 'Recovered AI policy',
        url: pendingUrl,
        text: 'AI policy',
      },
    };

    const result = await collect({
      sources: [HTML_SOURCE],
      state,
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [HTML_SOURCE.url]: 503,
        [pendingUrl]:
          '<html><body><h1>Recovered AI policy guidance</h1></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.developments.map((item) => item.url)).toContain(pendingUrl);
    expect(result.state.seen[pendingUrl].status).toBe('processed');
    expect(result.meta.collector.sourceResults[0]).toMatchObject({
      status: 'error',
      coverageEligible: true,
    });
    expect(result.meta.collector.health).toBe('failed');
  });

  it('excludes pending-only retries from due-source coverage', async () => {
    const weeklySource: WatchSource = {
      ...HTML_SOURCE,
      schedule: 'weekly',
    };
    const pendingUrl =
      'https://www.example.gov.au/news/pending-weekly-ai-policy';
    const state = emptyWatchState();
    state.lastCheckedBySource[weeklySource.id] =
      '2026-07-09T00:00:00.000Z';
    state.seen[pendingUrl] = {
      firstSeenAt: '2026-07-09T00:00:00.000Z',
      sourceId: weeklySource.id,
      status: 'pending',
      candidate: {
        title: 'Pending weekly AI policy',
        url: pendingUrl,
        text: 'AI policy',
      },
    };
    const fetchImpl = fakeFetch({
      [pendingUrl]:
        '<html><body><h1>Pending weekly AI policy</h1></body></html>',
    });

    const result = await collect({
      sources: [weeklySource],
      state,
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).not.toHaveBeenCalledWith(
      weeklySource.url,
      expect.anything(),
    );
    expect(result.meta.collector).toMatchObject({
      dueSourceCount: 0,
      successfulSourceCount: 0,
      failedSourceCount: 0,
      successRate: 1,
    });
    expect(result.meta.collector.sourceResults[0]).toMatchObject({
      status: 'success',
      coverageEligible: false,
    });
  });

  it('does not substitute detection time for a missing source date', async () => {
    const undatedRss = `<?xml version="1.0"?>
      <rss version="2.0"><channel><item>
        <title>AI governance policy published</title>
        <link>https://www.example.gov.au/policy/undated-ai-policy</link>
      </item></channel></rss>`;
    const result = await collect({
      sources: [RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': undatedRss,
        'https://www.example.gov.au/policy/undated-ai-policy':
          '<html><body><h1>AI governance policy</h1></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
      minScoreForReview: 0.5,
    });

    expect(result.developments[0].publishedAt).toBeUndefined();
    expect(
      (result.reviewCandidates[0].proposedRecord as { effectiveDate?: string })
        .effectiveDate,
    ).toBeUndefined();
  });

  it('preserves the previous healthy timestamp when source coverage fails', async () => {
    const previousMeta = {
      lastCollectedAt: '2026-07-09T00:00:00.000Z',
      lastHealthyAt: '2026-07-09T00:00:00.000Z',
      lastReviewedAt: null,
      collector: {
        runCount: 1,
        lastRunSources: [],
        lastRunErrors: [],
        health: 'healthy' as const,
        dueSourceCount: 1,
        successfulSourceCount: 1,
        failedSourceCount: 0,
        skippedSourceCount: 0,
        successRate: 1,
        automaticSourceCount: 2,
        manualSourceCount: 0,
        sourceResults: [],
      },
    };
    const result = await collect({
      sources: [HTML_SOURCE, RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      previousMeta,
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/news': 403,
        'https://www.example.gov.au/rss':
          '<html><body>Interstitial page with no feed</body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.meta.collector.health).toBe('failed');
    expect(result.meta.collector.successRate).toBe(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('no extractable index or feed items'),
      ]),
    );
    expect(result.meta.lastHealthyAt).toBe(previousMeta.lastHealthyAt);
  });

  it('baselines direct documents and emits a lead only when content changes', async () => {
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      title: 'Test AI governance policy',
      sourceUrl: DOCUMENT_SOURCE.url,
      dates: [
        {
          type: 'published',
          date: '2026-01-01',
          precision: 'day',
          primary: true,
          source: { url: DOCUMENT_SOURCE.url },
        },
      ],
      effectiveDate: '2026-01-01',
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: { url: DOCUMENT_SOURCE.url },
      },
    });
    const initial = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version one.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(initial.developments).toEqual([]);
    expect(initial.meta.collector.sourceResults[0]).toMatchObject({
      itemCount: 1,
      candidateCount: 0,
    });

    const changed = await collect({
      sources: [DOCUMENT_SOURCE],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version two adds assurance.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(changed.developments).toHaveLength(1);
    expect(changed.developments[0].url).toBe(DOCUMENT_SOURCE.url);
    expect(changed.reviewCandidates).toHaveLength(1);
    expect(changed.reviewCandidates[0]).toMatchObject({
      targetPolicyId: trackedPolicy.id,
      sourceUrl: DOCUMENT_SOURCE.url,
      proposedRecord: {
        id: trackedPolicy.id,
        sourceUrl: DOCUMENT_SOURCE.url,
      },
    });
    expect(changed.state.sourceSnapshots[DOCUMENT_SOURCE.id].lastChangedAt).toBe(
      '2026-07-10T00:00:00.000Z',
    );

    const changedAgain = await collect({
      sources: [DOCUMENT_SOURCE],
      state: changed.state,
      existingDevelopments: changed.developments,
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version three adds review controls.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(changedAgain.developments).toHaveLength(1);
    expect(changedAgain.developments[0].id).not.toBe(
      changed.developments[0].id,
    );

    const repeatedVersion = await collect({
      sources: [DOCUMENT_SOURCE],
      state: changedAgain.state,
      existingDevelopments: [
        ...changed.developments,
        ...changedAgain.developments,
      ],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version two adds assurance.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-30T00:00:00.000Z'),
    });

    expect(repeatedVersion.developments).toHaveLength(1);
    expect(repeatedVersion.developments[0].id).not.toBe(
      changed.developments[0].id,
    );
    expect(
      repeatedVersion.state.sourceSnapshots[DOCUMENT_SOURCE.id].changeCount,
    ).toBe(3);
  });

  it('compares a first document snapshot with the verified policy fingerprint', async () => {
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: DOCUMENT_SOURCE.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: DOCUMENT_SOURCE.url,
          contentHash: 'a'.repeat(64),
        },
      },
    });

    const result = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Changed since editorial verification.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.developments).toHaveLength(1);
    expect(result.reviewCandidates[0]).toMatchObject({
      targetPolicyId: trackedPolicy.id,
      sourceVersionSequence: 1,
    });
    expect(
      result.state.sourceSnapshots[DOCUMENT_SOURCE.id],
    ).toMatchObject({
      changeCount: 1,
      lastChangedAt: '2026-07-10T00:00:00.000Z',
    });
  });

  it('stages re-verification instead of silently baselining a verified policy without a fingerprint', async () => {
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-without-baseline',
      sourceUrl: DOCUMENT_SOURCE.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: { url: DOCUMENT_SOURCE.url },
      },
    });

    const result = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Current bytes require editorial comparison before baselining.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.developments).toHaveLength(1);
    expect(result.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: trackedPolicy.id,
        sourceVersionSequence: 1,
        analysis: expect.objectContaining({
          summary: expect.stringContaining('no stored source fingerprint'),
        }),
      }),
    ]);
    expect(
      result.state.sourceSnapshots[DOCUMENT_SOURCE.id],
    ).toMatchObject({ changeCount: 1 });
  });

  it('anchors tracked documents to the canonical verified fingerprint', async () => {
    const versionABody =
      '<html><body><main><h1>AI governance policy</h1><p>Version A source.</p></main></body></html>';
    const versionBBody =
      '<html><body><main><h1>AI governance policy</h1><p>Version B source.</p></main></body></html>';
    const versionA = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: versionABody,
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const versionB = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: versionBBody,
      }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const versionAHash =
      versionA.state.sourceSnapshots[DOCUMENT_SOURCE.id].contentHash;
    const versionBHash =
      versionB.state.sourceSnapshots[DOCUMENT_SOURCE.id].contentHash;
    const reverifiedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: DOCUMENT_SOURCE.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-02T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: DOCUMENT_SOURCE.url,
          contentHash: versionBHash,
        },
      },
    });

    const staleSource = await collect({
      sources: [DOCUMENT_SOURCE],
      state: versionA.state,
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [reverifiedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: versionABody,
      }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(staleSource.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: reverifiedPolicy.id,
        analysis: expect.objectContaining({
          summary: expect.stringContaining('source content'),
        }),
        sourceEvidence: expect.objectContaining({
          contentHash: versionAHash,
        }),
      }),
    ]);

    const currentSource = await collect({
      sources: [DOCUMENT_SOURCE],
      state: versionA.state,
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [reverifiedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: versionBBody,
      }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(currentSource.errors).toEqual([]);
    expect(currentSource.developments).toEqual([]);
    expect(currentSource.reviewCandidates).toEqual([]);
    expect(currentSource.state.sourceSnapshots[DOCUMENT_SOURCE.id]).toMatchObject({
      contentHash: versionBHash,
      lastCheckedAt: '2026-07-03T00:00:00.000Z',
      lastChangedAt: '2026-07-03T00:00:00.000Z',
    });
  });

  it('keeps the previous direct-document snapshot when changed content cannot be extracted', async () => {
    const initial = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version one.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const previousSnapshot =
      initial.state.sourceSnapshots[DOCUMENT_SOURCE.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: DOCUMENT_SOURCE.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: DOCUMENT_SOURCE.url,
          contentHash: previousSnapshot.contentHash,
        },
      },
    });

    const failedChange = await collect({
      sources: [DOCUMENT_SOURCE],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(failedChange.errors).toHaveLength(1);
    expect(failedChange.state.sourceSnapshots[DOCUMENT_SOURCE.id]).toEqual(
      previousSnapshot,
    );
    expect(failedChange.state.lastCheckedBySource[DOCUMENT_SOURCE.id]).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(failedChange.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: trackedPolicy.id,
        sourceEvidence: expect.objectContaining({
          contentHash: expect.not.stringMatching(
            previousSnapshot.contentHash,
          ),
        }),
      }),
    ]);
    expect(failedChange.developments).toEqual([
      expect.objectContaining({
        status: 'detected',
        verification: expect.objectContaining({
          status: 'needs_review',
        }),
      }),
    ]);

    const failedVersionKey = Object.keys(failedChange.state.seen).find(
      (key) => key.includes('policai-change='),
    );
    expect(failedVersionKey).toBeDefined();
    failedChange.state.seen[failedVersionKey as string] = {
      ...failedChange.state.seen[failedVersionKey as string],
      status: 'failed',
      attempts: 5,
    };

    const exhaustedVersion = await collect({
      sources: [DOCUMENT_SOURCE],
      state: failedChange.state,
      existingDevelopments: failedChange.developments,
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-18T00:00:00.000Z'),
    });

    expect(exhaustedVersion.errors).toEqual([
      expect.stringContaining('manual review is required'),
    ]);
    expect(exhaustedVersion.developments).toEqual([]);
    expect(exhaustedVersion.reviewCandidates).toEqual([]);
    expect(exhaustedVersion.meta.collector.sourceResults[0].status).toBe(
      'error',
    );
    expect(
      exhaustedVersion.state.lastCheckedBySource[DOCUMENT_SOURCE.id],
    ).toBe('2026-07-01T00:00:00.000Z');
  });

  it('keeps a successfully classified update unresolved until editorial publication', async () => {
    const baselineBody =
      '<html><body><main><h1>AI governance policy</h1><p>Version A baseline.</p></main></body></html>';
    const changedBody =
      '<html><body><main><h1>AI governance policy</h1><p>Version B with new assurance obligations.</p></main></body></html>';
    const initial = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({ [DOCUMENT_SOURCE.url]: baselineBody }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baselineHash =
      initial.state.sourceSnapshots[DOCUMENT_SOURCE.id].contentHash;
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: DOCUMENT_SOURCE.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: DOCUMENT_SOURCE.url,
          contentHash: baselineHash,
        },
      },
    });
    const changed = await collect({
      sources: [DOCUMENT_SOURCE],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({ [DOCUMENT_SOURCE.url]: changedBody }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const changedReview = changed.reviewCandidates[0];
    const changedFingerprint = `${changedReview.sourceEvidence.contentHash}:1`;
    expect(
      Object.values(changed.state.seen).find(
        (entry) =>
          entry.candidate?.changeFingerprint === changedFingerprint,
      ),
    ).toMatchObject({ status: 'processed' });

    const reverted = await collect({
      sources: [DOCUMENT_SOURCE],
      state: changed.state,
      sourceReviews: [changedReview],
      existingDevelopments: changed.developments,
      trackedUrls: [DOCUMENT_SOURCE.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({ [DOCUMENT_SOURCE.url]: baselineBody }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(reverted.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: trackedPolicy.id,
        sourceVersionSequence: 2,
        notes: expect.stringContaining(
          'returned to the last verified fingerprint',
        ),
      }),
    ]);
    expect(
      Object.values(reverted.state.seen).find(
        (entry) =>
          entry.candidate?.changeFingerprint === changedFingerprint,
      ),
    ).toMatchObject({
      status: 'dismissed',
      lastError: 'Superseded by source transition 2',
    });
  });

  it('does not process a pending document version with bytes from a newer version', async () => {
    const weeklyDocument = {
      ...DOCUMENT_SOURCE,
      schedule: 'weekly' as const,
    };
    const initial = await collect({
      sources: [weeklyDocument],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version A baseline.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baseline =
      initial.state.sourceSnapshots[weeklyDocument.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: weeklyDocument.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: weeklyDocument.url,
          contentHash: baseline.contentHash,
        },
      },
    });
    const failedVersionB = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const versionBHash =
      failedVersionB.reviewCandidates[0].sourceEvidence.contentHash;

    const retriedAgainstVersionC = await collect({
      sources: [weeklyDocument],
      state: failedVersionB.state,
      existingDevelopments: failedVersionB.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version C replaces the unreadable revision.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(
      retriedAgainstVersionC.state.sourceSnapshots[weeklyDocument.id],
    ).toEqual(baseline);
    expect(retriedAgainstVersionC.errors).toEqual([]);
    expect(retriedAgainstVersionC.reviewCandidates).toHaveLength(1);
    const versionCReview = retriedAgainstVersionC.reviewCandidates[0];
    expect(versionCReview.sourceEvidence.contentHash).not.toBe(
      versionBHash,
    );
    expect(
      versionCReview.linkedDevelopment?.verification.source.contentHash,
    ).toBe(versionCReview.sourceEvidence.contentHash);
    const pendingVersions = Object.values(
      retriedAgainstVersionC.state.seen,
    ).filter(
      (entry) =>
        entry.sourceId === weeklyDocument.id &&
        entry.candidate?.changeFingerprint,
    );
    expect(pendingVersions).toHaveLength(2);
    expect(
      pendingVersions.map((entry) => entry.status).sort(),
    ).toEqual(
      ['dismissed', 'pending'],
    );
    expect(
      pendingVersions.some((entry) =>
        entry.lastError?.includes(
          'Document content changed before the pending version',
        ),
      ),
    ).toBe(false);

    const reappearedVersionB = await collect({
      sources: [weeklyDocument],
      state: retriedAgainstVersionC.state,
      existingDevelopments: retriedAgainstVersionC.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-04T00:00:00.000Z'),
    });

    const transitions = Object.values(
      reappearedVersionB.state.seen,
    )
      .filter(
        (entry) =>
          entry.sourceId === weeklyDocument.id &&
          entry.candidate?.changeFingerprint,
      )
      .sort((left, right) =>
        (left.candidate?.changeFingerprint ?? '').localeCompare(
          right.candidate?.changeFingerprint ?? '',
        ),
      );
    expect(transitions).toHaveLength(3);
    expect(
      transitions.filter((entry) => entry.status === 'dismissed'),
    ).toHaveLength(2);
    expect(
      transitions.some(
        (entry) =>
          entry.status === 'pending' &&
          entry.candidate?.changeFingerprint === `${versionBHash}:3`,
      ),
    ).toBe(true);
    expect(reappearedVersionB.reviewCandidates).toEqual([
      expect.objectContaining({
        sourceVersionSequence: 3,
        sourceEvidence: expect.objectContaining({
          contentHash: versionBHash,
        }),
      }),
    ]);
  });

  it('stages a baseline-reversion review when an unreadable change returns to the verified bytes', async () => {
    const weeklyDocument = {
      ...DOCUMENT_SOURCE,
      schedule: 'weekly' as const,
    };
    const baselineBody =
      '<html><body><main><h1>AI governance policy</h1><p>Version A baseline.</p></main></body></html>';
    const initial = await collect({
      sources: [weeklyDocument],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: baselineBody,
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baseline = initial.state.sourceSnapshots[weeklyDocument.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: weeklyDocument.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: weeklyDocument.url,
          contentHash: baseline.contentHash,
        },
      },
    });
    const unreadableChange = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const changedHash =
      unreadableChange.reviewCandidates[0].sourceEvidence.contentHash;

    const reverted = await collect({
      sources: [weeklyDocument],
      state: unreadableChange.state,
      existingDevelopments: unreadableChange.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: baselineBody,
      }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(reverted.errors).toEqual([]);
    expect(reverted.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: trackedPolicy.id,
        sourceVersionSequence: 2,
        notes: expect.stringContaining(
          'returned to the last verified fingerprint',
        ),
        sourceEvidence: expect.objectContaining({
          contentHash: baseline.contentHash,
        }),
      }),
    ]);
    const transitions = Object.values(reverted.state.seen).filter(
      (entry) =>
        entry.sourceId === weeklyDocument.id &&
        entry.candidate?.changeFingerprint,
    );
    expect(transitions).toHaveLength(2);
    expect(transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'dismissed',
          candidate: expect.objectContaining({
            changeFingerprint: `${changedHash}:1`,
          }),
        }),
        expect.objectContaining({
          status: 'pending',
          candidate: expect.objectContaining({
            changeFingerprint: `${baseline.contentHash}:2`,
          }),
        }),
      ]),
    );

    const approvedReview = {
      ...unreadableChange.reviewCandidates[0],
      status: 'approved' as const,
      reviewedAt: '2026-07-02T12:00:00.000Z',
      reviewedBy: 'reviewer',
      approvalNotes: 'Verified replacement pending publication',
      updatedAt: '2026-07-02T12:00:00.000Z',
    };
    const revertedAfterApproval = await collect({
      sources: [weeklyDocument],
      state: unreadableChange.state,
      sourceReviews: [approvedReview],
      existingDevelopments: unreadableChange.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: baselineBody,
      }),
      now: () => new Date('2026-07-03T12:00:00.000Z'),
    });

    expect(revertedAfterApproval.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: trackedPolicy.id,
        sourceVersionSequence: 2,
        notes: expect.stringContaining(
          'returned to the last verified fingerprint',
        ),
      }),
    ]);
    expect(
      Object.values(revertedAfterApproval.state.seen).find(
        (entry) =>
          entry.candidate?.changeFingerprint === `${changedHash}:1`,
      ),
    ).toMatchObject({
      status: 'dismissed',
      lastError: 'Superseded by source transition 2',
    });
  });

  it('recovers document version ordering from a review persisted before watch state', async () => {
    const weeklyDocument = {
      ...DOCUMENT_SOURCE,
      schedule: 'weekly' as const,
    };
    const initial = await collect({
      sources: [weeklyDocument],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version A baseline.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baseline = initial.state.sourceSnapshots[weeklyDocument.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: weeklyDocument.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: weeklyDocument.url,
          contentHash: baseline.contentHash,
        },
      },
    });
    const versionB = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const persistedReview = versionB.reviewCandidates[0];

    const recoveredRetry = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      sourceReviews: [persistedReview],
      existingDevelopments: versionB.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-02T12:00:00.000Z'),
    });
    const recoveredTransition = Object.values(
      recoveredRetry.state.seen,
    ).find(
      (entry) =>
        entry.candidate?.changeFingerprint ===
        `${persistedReview.sourceEvidence.contentHash}:1`,
    );

    expect(recoveredTransition).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: expect.any(String),
    });
    expect(recoveredRetry.errors).toEqual([
      expect.stringContaining('candidate retrieval failure'),
    ]);

    const versionC = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      sourceReviews: [persistedReview],
      existingDevelopments: versionB.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version C after the partial review write.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(persistedReview.sourceVersionSequence).toBe(1);
    expect(versionC.reviewCandidates).toEqual([
      expect.objectContaining({
        targetPolicyId: trackedPolicy.id,
        sourceVersionSequence: 2,
      }),
    ]);
  });

  it('allocates a new transition when a historical hash returns after the baseline moved', async () => {
    const weeklyDocument = {
      ...DOCUMENT_SOURCE,
      schedule: 'weekly' as const,
    };
    const baselineBody =
      '<html><body><main><h1>AI governance policy</h1><p>Editorial baseline B.</p></main></body></html>';
    const historicalBody =
      '<html><body><main><h1>AI governance policy</h1><p>Historical version C.</p></main></body></html>';
    const initial = await collect({
      sources: [weeklyDocument],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({ [weeklyDocument.url]: baselineBody }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baseline = initial.state.sourceSnapshots[weeklyDocument.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: weeklyDocument.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: weeklyDocument.url,
          contentHash: baseline.contentHash,
        },
      },
    });
    const historical = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({ [weeklyDocument.url]: historicalBody }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    expect(historical.reviewCandidates[0].sourceVersionSequence).toBe(1);

    const movedBaselineState = {
      ...historical.state,
      sourceSnapshots: {
        ...historical.state.sourceSnapshots,
        [weeklyDocument.id]: {
          ...historical.state.sourceSnapshots[weeklyDocument.id],
          contentHash: baseline.contentHash,
        },
      },
    };
    const returnedHistorical = await collect({
      sources: [weeklyDocument],
      state: movedBaselineState,
      existingDevelopments: historical.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({ [weeklyDocument.url]: historicalBody }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(returnedHistorical.reviewCandidates).toEqual([
      expect.objectContaining({
        sourceVersionSequence: 2,
        sourceEvidence: expect.objectContaining({
          contentHash:
            historical.reviewCandidates[0].sourceEvidence.contentHash,
        }),
      }),
    ]);
  });

  it('preserves first discovery timestamps when enriching a persisted document transition', async () => {
    const weeklyDocument = {
      ...DOCUMENT_SOURCE,
      schedule: 'weekly' as const,
    };
    const baselineBody =
      '<html><body><main><h1>AI governance policy</h1><p>Version A baseline.</p></main></body></html>';
    const changedBody =
      '<html><body><main><h1>AI governance policy</h1><p>Version B with source-backed changes.</p></main></body></html>';
    const initial = await collect({
      sources: [weeklyDocument],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({ [weeklyDocument.url]: baselineBody }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baseline = initial.state.sourceSnapshots[weeklyDocument.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: weeklyDocument.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: weeklyDocument.url,
          contentHash: baseline.contentHash,
        },
      },
    });
    const firstAttempt = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({ [weeklyDocument.url]: changedBody }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const persistedReview = firstAttempt.reviewCandidates[0];
    const persistedDevelopment = firstAttempt.developments[0];

    const enrichedRetry = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      sourceReviews: [persistedReview],
      existingDevelopments: [persistedDevelopment],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({ [weeklyDocument.url]: changedBody }),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(enrichedRetry.reviewCandidates[0]).toMatchObject({
      id: persistedReview.id,
      discoveredAt: persistedReview.discoveredAt,
      linkedDevelopment: {
        detectedAt: persistedDevelopment.detectedAt,
      },
    });
    expect(enrichedRetry.developments[0]).toMatchObject({
      id: persistedDevelopment.id,
      detectedAt: persistedDevelopment.detectedAt,
    });
  });

  it('reconciles a published manual document review with failed watch state', async () => {
    const weeklyDocument = {
      ...DOCUMENT_SOURCE,
      schedule: 'weekly' as const,
    };
    const initial = await collect({
      sources: [weeklyDocument],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [weeklyDocument.url]:
          '<html><body><main><h1>AI governance policy</h1><p>Version A baseline.</p></main></body></html>',
      }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    const baseline = initial.state.sourceSnapshots[weeklyDocument.id];
    const trackedPolicy = buildPolicy({
      id: 'tracked-document-policy',
      sourceUrl: weeklyDocument.url,
      verification: {
        status: 'verified',
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: weeklyDocument.url,
          contentHash: baseline.contentHash,
        },
      },
    });
    const changed = await collect({
      sources: [weeklyDocument],
      state: initial.state,
      existingDevelopments: [],
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      force: true,
      fetchImpl: fakeFetch({
        [weeklyDocument.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const persistedReview = changed.reviewCandidates[0];
    const transitionKey = Object.keys(changed.state.seen).find(
      (key) =>
        changed.state.seen[key].candidate?.changeFingerprint ===
        `${persistedReview.sourceEvidence.contentHash}:1`,
    );
    expect(transitionKey).toBeDefined();
    const failedState = {
      ...changed.state,
      seen: {
        ...changed.state.seen,
        [transitionKey as string]: {
          ...changed.state.seen[transitionKey as string],
          status: 'failed' as const,
          attempts: 5,
          lastError: 'Automatic extraction requires OCR',
        },
      },
      sourceSnapshots: { ...changed.state.sourceSnapshots },
    };
    const publishedReview = {
      ...persistedReview,
      status: 'published' as const,
      reviewedAt: '2026-07-02T01:00:00.000Z',
      reviewedBy: 'reviewer',
      publishedAt: '2026-07-02T02:00:00.000Z',
      updatedAt: '2026-07-02T02:00:00.000Z',
    };

    const recovered = await collect({
      sources: [weeklyDocument],
      state: failedState,
      sourceReviews: [publishedReview],
      existingDevelopments: changed.developments,
      trackedUrls: [weeklyDocument.url],
      trackedPolicies: [trackedPolicy],
      fetchImpl: fakeFetch({}),
      now: () => new Date('2026-07-03T00:00:00.000Z'),
    });

    expect(recovered.errors).toEqual([]);
    expect(recovered.developments).toEqual([]);
    expect(recovered.state.seen[transitionKey as string]).toMatchObject({
      status: 'processed',
      attempts: 5,
      processedAt: publishedReview.publishedAt,
    });
    expect(
      recovered.state.seen[transitionKey as string].lastError,
    ).toBeUndefined();
    expect(recovered.state.sourceSnapshots[weeklyDocument.id]).toMatchObject({
      contentHash: persistedReview.sourceEvidence.contentHash,
      changeCount: 1,
      lastCheckedAt: persistedReview.sourceEvidence.retrievedAt,
      lastChangedAt: publishedReview.reviewedAt,
    });
    expect(recovered.state.lastCheckedBySource[weeklyDocument.id]).toBe(
      persistedReview.sourceEvidence.retrievedAt,
    );
  });

  it('does not baseline an unreadable direct document', async () => {
    const result = await collect({
      sources: [DOCUMENT_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        [DOCUMENT_SOURCE.url]: {
          body: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
          contentType: 'application/pdf',
        },
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.state.sourceSnapshots[DOCUMENT_SOURCE.id]).toBeUndefined();
    expect(result.meta.collector.sourceResults[0]).toMatchObject({
      status: 'error',
      coverageEligible: true,
    });
  });

  it('processes fresh discoveries without allowing failed retries to monopolise the run', async () => {
    const state = emptyWatchState();
    const pendingUrls = Array.from(
      { length: 5 },
      (_, index) => `https://www.example.gov.au/news/pending-${index + 1}`,
    );
    for (const [index, url] of pendingUrls.entries()) {
      state.seen[url] = {
        firstSeenAt: `2026-07-0${index + 1}T00:00:00.000Z`,
        sourceId: HTML_SOURCE.id,
        status: 'pending',
        attempts: 3,
        lastAttemptAt: `2026-07-0${index + 1}T00:00:00.000Z`,
        candidate: {
          title: `Pending AI policy ${index + 1}`,
          url,
          text: 'AI policy',
        },
      };
    }
    const freshUrl =
      'https://www.example.gov.au/news/fresh-ai-policy-development';
    const indexHtml = `<html><body><main><ul class="news-list"><li><a href="${freshUrl}">Fresh AI policy development</a></li></ul></main></body></html>`;
    const routes: Record<string, FakeRoute> = {
      [HTML_SOURCE.url]: indexHtml,
      [freshUrl]:
        '<html><body><h1>Fresh AI policy development</h1></body></html>',
    };
    for (const url of pendingUrls) routes[url] = 503;

    const result = await collect({
      sources: [HTML_SOURCE],
      state,
      existingDevelopments: [],
      maxItemsPerSource: 5,
      fetchImpl: fakeFetch(routes),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.developments.map((item) => item.url)).toContain(freshUrl);
    expect(
      pendingUrls.filter(
        (url) => result.state.seen[url].attempts === 4,
      ),
    ).toHaveLength(4);
    expect(
      pendingUrls.filter(
        (url) => result.state.seen[url].attempts === 3,
      ),
    ).toHaveLength(1);
  });

  it('reserves a retry slot when the per-source limit is one', async () => {
    const state = emptyWatchState();
    const pendingUrl = 'https://www.example.gov.au/news/pending-retry';
    const freshUrl = 'https://www.example.gov.au/news/fresh-discovery';
    state.seen[pendingUrl] = {
      firstSeenAt: '2026-07-01T00:00:00.000Z',
      sourceId: HTML_SOURCE.id,
      status: 'pending',
      attempts: 1,
      candidate: {
        title: 'Pending AI policy retry',
        url: pendingUrl,
        text: 'AI policy',
      },
    };
    const indexHtml = `<html><body><main><ul class="news-list"><li><a href="${freshUrl}">Fresh AI policy development</a></li></ul></main></body></html>`;

    const result = await collect({
      sources: [HTML_SOURCE],
      state,
      existingDevelopments: [],
      maxItemsPerSource: 1,
      fetchImpl: fakeFetch({
        [HTML_SOURCE.url]: indexHtml,
        [pendingUrl]: 503,
        [freshUrl]: '<html><body><h1>Fresh AI policy development</h1></body></html>',
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.state.seen[pendingUrl].attempts).toBe(2);
    expect(result.state.seen[freshUrl]).toMatchObject({
      status: 'pending',
      attempts: 0,
    });
  });
});

describe('collect browser fallback', () => {
  beforeEach(() => {
    hasAiProvider.mockReturnValue(false);
  });

  it('retries a blocked source through the browser retriever', async () => {
    const fetchImpl = fakeFetch({
      'https://www.example.gov.au/news': 403,
      'https://www.example.gov.au/news/ai-policy-framework': 403,
    });
    const browserFetchImpl = fakeFetch({
      'https://www.example.gov.au/news': INDEX_HTML,
      'https://www.example.gov.au/news/ai-policy-framework':
        '<html><body><h1>New AI policy framework released</h1></body></html>',
      'https://www.example.gov.au/news/seen-before':
        '<html><body><h1>Existing AI governance standard update</h1></body></html>',
    });

    const result = await collect({
      sources: [HTML_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      browserFetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(browserFetchImpl).toHaveBeenCalled();
    expect(result.errors).toEqual([]);
    expect(result.meta.collector.sourceResults[0].status).toBe('success');
    expect(
      result.developments.map((development) => development.url),
    ).toContain('https://www.example.gov.au/news/ai-policy-framework');
  });

  it('uses the browser retriever directly for browser-strategy sources', async () => {
    const browserSource: WatchSource = {
      ...HTML_SOURCE,
      fetchStrategy: 'browser',
    };
    const fetchImpl = fakeFetch({});
    const browserFetchImpl = fakeFetch({
      'https://www.example.gov.au/news': INDEX_HTML,
      'https://www.example.gov.au/news/ai-policy-framework':
        '<html><body><h1>New AI policy framework released</h1></body></html>',
      'https://www.example.gov.au/news/seen-before':
        '<html><body><h1>Existing AI governance standard update</h1></body></html>',
    });

    const result = await collect({
      sources: [browserSource],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      browserFetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(browserFetchImpl).toHaveBeenCalled();
    expect(result.errors).toEqual([]);
    expect(result.meta.collector.sourceResults[0].status).toBe('success');
  });

  it('still reports failure when both retrievers fail', async () => {
    const result = await collect({
      sources: [HTML_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({ 'https://www.example.gov.au/news': 403 }),
      browserFetchImpl: fakeFetch({
        'https://www.example.gov.au/news': 403,
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.meta.collector.sourceResults[0].status).toBe('error');
  });

  it('treats a valid but empty feed as successful coverage', async () => {
    const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>House Inquiries</title>
  <description>This feed contains new inquiries</description>
</channel></rss>`;

    const result = await collect({
      sources: [RSS_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: fakeFetch({
        'https://www.example.gov.au/rss': {
          body: emptyFeed,
          contentType: 'application/rss+xml',
        },
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors).toEqual([]);
    expect(result.meta.collector.sourceResults[0].status).toBe('success');
    expect(result.developments).toEqual([]);
  });

  it('does not attempt the browser retriever when none is provided', async () => {
    const fetchImpl = fakeFetch({ 'https://www.example.gov.au/news': 403 });

    const result = await collect({
      sources: [HTML_SOURCE],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.meta.collector.sourceResults[0].status).toBe('error');
  });
});
