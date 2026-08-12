/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  firecrawlBaseUrl,
  scrapeWithFirecrawl as scrapeWithFirecrawlRaw,
  type FirecrawlOptions,
} from './firecrawl';

function scrapeWithFirecrawl(url: string, options: FirecrawlOptions = {}) {
  return scrapeWithFirecrawlRaw(url, {
    resolveHost: async () => ['93.184.216.34'],
    ...options,
  });
}

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
      JSON.stringify({
        success: true,
        data: {
          markdown: '# OAIC',
          metadata: {
            title: 'OAIC',
            sourceURL: 'https://www.oaic.gov.au/',
          },
        },
      }),
      { status: 200 },
    )));
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');
    expect(result).toEqual({
      ok: true,
      markdown: '# OAIC',
      title: 'OAIC',
      finalUrl: 'https://www.oaic.gov.au/',
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

  it('rejects an oversized declared response before parsing JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('small', {
      status: 200,
      headers: { 'content-length': '101' },
    })));

    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/', {
      maxResponseBytes: 100,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'response_too_large',
    });
  });

  it('aborts a chunked response when streamed bytes exceed the limit', async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"success":'));
          controller.enqueue(encoder.encode('true,"padding":"too large"}'));
          controller.close();
        },
      }),
      { status: 200 },
    )));

    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/', {
      maxResponseBytes: 16,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'response_too_large',
    });
  });

  it('rejects malformed JSON as an invalid response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{not-json', {
      status: 200,
    })));

    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');

    expect(result).toMatchObject({ ok: false, reason: 'invalid_response' });
  });

  it('rejects success payloads without final URL provenance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { markdown: '# OAIC', metadata: { title: 'OAIC' } },
    }), { status: 200 })));

    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_provenance',
    });
  });

  it('rejects conflicting Firecrawl final URL metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        markdown: '# OAIC',
        metadata: {
          sourceURL: 'https://www.oaic.gov.au/',
          url: 'https://evil.example/',
        },
      },
    }), { status: 200 })));

    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_provenance',
    });
  });

  it('rejects a final source URL resolving to a private address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        markdown: '# OAIC',
        metadata: { sourceURL: 'https://internal.example.gov.au/' },
      },
    }), { status: 200 })));

    const result = await scrapeWithFirecrawl(
      'https://www.oaic.gov.au/',
      { resolveHost: async () => ['10.0.0.5'] },
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_provenance',
    });
  });

  it('returns the verified Firecrawl final URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        markdown: '# OAIC',
        metadata: {
          sourceURL: 'https://www.oaic.gov.au/privacy/final',
        },
      },
    }), { status: 200 })));

    const result = await scrapeWithFirecrawl(
      'https://www.oaic.gov.au/privacy/start',
    );

    expect(result).toMatchObject({
      ok: true,
      finalUrl: 'https://www.oaic.gov.au/privacy/final',
    });
  });
});
