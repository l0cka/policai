/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { firecrawlBaseUrl, scrapeWithFirecrawl } from './firecrawl';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('firecrawlBaseUrl', () => {
  it('defaults to the demand-started proxy port, never the raw API', () => {
    vi.unstubAllEnvs();
    expect(firecrawlBaseUrl()).toBe('http://127.0.0.1:3003');
  });

  it('honours FIRECRAWL_URL and strips a trailing slash', () => {
    vi.stubEnv('FIRECRAWL_URL', 'http://example.test:9999/');
    expect(firecrawlBaseUrl()).toBe('http://example.test:9999');
  });
});

describe('scrapeWithFirecrawl', () => {
  it('returns markdown and title on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ success: true, data: { markdown: '# OAIC', metadata: { title: 'OAIC' } } }),
      { status: 200 },
    )));
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');
    expect(result).toEqual({
      ok: true, markdown: '# OAIC', title: 'OAIC', sourceUrl: 'https://www.oaic.gov.au/',
    });
  });

  it('posts to /v2/scrape on the proxy port', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ success: true, data: { markdown: 'x', metadata: {} } }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await scrapeWithFirecrawl('https://example.test/');
    const calls = fetchMock.mock.calls as Array<unknown[]>;
    expect(calls[0]?.[0]).toBe('http://127.0.0.1:3003/v2/scrape');
  });

  it('reports empty rather than success when markdown is blank', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ success: true, data: { markdown: '   ', metadata: {} } }), { status: 200 },
    )));
    const result = await scrapeWithFirecrawl('https://example.test/');
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('classifies a connection refusal as unavailable, not a source failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const result = await scrapeWithFirecrawl('https://example.test/');
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('classifies an abort as timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }));
    const result = await scrapeWithFirecrawl('https://example.test/');
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
  });
});
