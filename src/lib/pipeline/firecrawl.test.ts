/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  firecrawlBaseUrl,
  scrapeWithFirecrawl as scrapeWithFirecrawlRaw,
  type FirecrawlOptions,
} from './firecrawl';
import { buildRecordingHostGate } from '@/test/factories';

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
          rawHtml: '<main><h1>OAIC</h1></main>',
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
      rawHtml: '<main><h1>OAIC</h1></main>',
      title: 'OAIC',
      finalUrl: 'https://www.oaic.gov.au/',
    });
  });

  it('requests and returns the raw HTML so linked documents can be checked', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown: '# OAIC',
          rawHtml: '<html><body><main><h1>OAIC</h1></main></body></html>',
          metadata: { sourceURL: 'https://www.oaic.gov.au/' },
        },
      }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as { formats: string[] };
    expect(body.formats).toEqual(['markdown', 'rawHtml']);
    expect(result).toMatchObject({
      ok: true,
      rawHtml: '<html><body><main><h1>OAIC</h1></main></body></html>',
    });
  });

  it('reports empty rather than success when the raw HTML is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown: '# OAIC',
          metadata: { sourceURL: 'https://www.oaic.gov.au/' },
        },
      }),
      { status: 200 },
    )));
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/');
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
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

  it('asks Firecrawl to present the declared Policai identity by default', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ success: true, data: { markdown: 'x', metadata: {} } }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await scrapeWithFirecrawl('https://example.test/');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as {
      url: string;
      headers?: Record<string, string>;
    };
    expect(body.url).toBe('https://example.test/');
    expect(body.headers?.['User-Agent']).toMatch(
      /Chrome\/[\d.]+ Safari\/537\.36 Policai\/1\.0 \(\+https:\/\/policai\.org\)$/,
    );
  });

  it('refuses exempt requests before calling Firecrawl', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(scrapeWithFirecrawl('https://example.test/', { identity: 'exempt' })).resolves.toMatchObject({ ok: false, reason: 'identity_scope' });
    expect(fetchMock).not.toHaveBeenCalled();
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
      data: { markdown: '# OAIC', rawHtml: '<main><h1>OAIC</h1></main>', metadata: { title: 'OAIC' } },
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
        rawHtml: '<main><h1>OAIC</h1></main>',
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
        rawHtml: '<main><h1>OAIC</h1></main>',
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
        rawHtml: '<main><h1>OAIC</h1></main>',
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

describe('scrapeWithFirecrawl host gate', () => {
  const payload = (sourceURL: string, statusCode?: number) =>
    JSON.stringify({
      success: true,
      data: {
        markdown: '# OAIC',
        rawHtml: '<html><body><main><h1>OAIC</h1></main></body></html>',
        metadata: { sourceURL, ...(statusCode === undefined ? {} : { statusCode }) },
      },
    });

  it('admits the target before posting to Firecrawl and observes the final status', async () => {
    const { gate, admitted, observed } = buildRecordingHostGate();
    const fetchMock = vi.fn(async () => {
      expect(admitted).toEqual(['https://www.oaic.gov.au/news']);
      return new Response(payload('https://www.oaic.gov.au/news', 200), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/news', { gate });
    expect(result.ok).toBe(true);
    expect(observed).toEqual([['https://www.oaic.gov.au/news', { status: 200, retryAfter: null, transport: 'firecrawl' }]]);
  });

  it('records no observation when Firecrawl omits the status code, so a backoff is not cleared by guesswork', async () => {
    const { gate, observed } = buildRecordingHostGate();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(payload('https://www.oaic.gov.au/news'), { status: 200 })));
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/news', { gate });
    expect(result.ok).toBe(true);
    expect(observed).toEqual([]);
  });

  it('throws the gate refusal as a SourceFetchError and never contacts Firecrawl', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { gate } = buildRecordingHostGate((url) => ({
      kind: 'refused',
      cls: 'robots_disallowed',
      detail: `${url} is disallowed by robots.txt for Policai`,
    }));
    await expect(scrapeWithFirecrawl('https://www.oaic.gov.au/search', { gate })).rejects.toMatchObject({
      name: 'SourceFetchError',
      code: 'gate_refused',
      retryable: false,
      url: 'https://www.oaic.gov.au/search',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admits a cross-host final URL after the scrape and discards a refused one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(payload('https://www.other.gov.au/landing'), { status: 200 })));
    const allowed = buildRecordingHostGate();
    const result = await scrapeWithFirecrawl('https://www.oaic.gov.au/news', { gate: allowed.gate });
    expect(result).toMatchObject({ ok: true, finalUrl: 'https://www.other.gov.au/landing' });
    expect(allowed.admitted).toEqual(['https://www.oaic.gov.au/news', 'https://www.other.gov.au/landing']);

    const refusing = buildRecordingHostGate((url) =>
      url.hostname === 'www.other.gov.au'
        ? { kind: 'refused', cls: 'robots_disallowed', detail: `${url} is disallowed by robots.txt for Policai` }
        : { kind: 'go' },
    );
    await expect(scrapeWithFirecrawl('https://www.oaic.gov.au/news', { gate: refusing.gate })).rejects.toMatchObject({
      code: 'gate_refused',
      url: 'https://www.other.gov.au/landing',
    });
  });
});
