/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserFetch,
  type BrowserLike,
  type BrowserPageLike,
  type BrowserResponseLike,
} from './browser-fetch';
import { retrieveSource } from './fetch';

interface FakePageScript {
  status?: number;
  /** Successive statuses per goto call; the last repeats. */
  statuses?: number[];
  finalUrl?: string;
  contentType?: string;
  /** Successive page.content() results; the last repeats. */
  contents?: string[];
  /** Raw response bytes served by the context request API. */
  bodyBytes?: Buffer;
  /** Overrides the navigation response body (e.g. empty for PDF downloads). */
  navigationBodyBytes?: Buffer;
  gotoResult?: 'null' | 'abort';
  /** Makes the context request API fail, as Akamai does to non-browser TLS. */
  requestGetResult?: 'timeout';
  /** Status the context request API returns (WAFs 403 non-browser TLS). */
  requestGetStatus?: number;
}

function fakeBrowser(
  routes: Record<string, FakePageScript>,
  browserVersion?: string,
) {
  const state = {
    launches: 0,
    closedBrowser: false,
    closedContexts: 0,
    waits: [] as number[],
    contextOptions: [] as Array<{ userAgent?: string } | undefined>,
    requestGets: [] as string[],
    inPageFetches: [] as string[],
  };

  const launch = vi.fn(async (): Promise<BrowserLike> => {
    state.launches++;
    return {
      ...(browserVersion ? { version: () => browserVersion } : {}),
      newContext: async (contextOptions?: { userAgent?: string }) => {
        state.contextOptions.push(contextOptions);
        return {
        newPage: async (): Promise<BrowserPageLike> => {
          let script: FakePageScript = {};
          let gotoIndex = 0;
          let readsInNavigation = 0;
          let currentUrl = '';
          return {
            goto: async (url: string): Promise<BrowserResponseLike | null> => {
              script = routes[url] ?? {};
              currentUrl = script.finalUrl ?? url;
              readsInNavigation = 0;
              if (script.gotoResult === 'null') return null;
              if (script.gotoResult === 'abort') {
                throw new Error(
                  `page.goto: net::ERR_ABORTED at ${url}`,
                );
              }
              const statuses = script.statuses ?? [script.status ?? 200];
              const status =
                statuses[Math.min(gotoIndex, statuses.length - 1)];
              gotoIndex++;
              return {
                status: () => status,
                url: () => currentUrl,
                headers: () => ({
                  'content-type': script.contentType ?? 'text/html',
                }),
                body: async () =>
                  script.navigationBodyBytes ??
                  script.bodyBytes ??
                  Buffer.from(script.contents?.[0] ?? ''),
              };
            },
            // Content reflects the last navigation, advancing again when the
            // page re-renders between reads (challenge settling).
            content: async () => {
              const contents = script.contents ?? [''];
              const index = Math.max(0, gotoIndex - 1) + readsInNavigation;
              readsInNavigation++;
              return contents[Math.min(index, contents.length - 1)];
            },
            url: () => currentUrl,
            // Stands in for an in-page same-origin fetch of the arg URL.
            evaluate: async (_fn: unknown, arg: unknown) => {
              const target = String(arg);
              state.inPageFetches.push(target);
              const targetScript = routes[target] ?? {};
              return {
                status: targetScript.status ?? 200,
                contentType: targetScript.contentType ?? 'text/html',
                base64: (targetScript.bodyBytes ?? Buffer.alloc(0)).toString(
                  'base64',
                ),
              } as never;
            },
            waitForTimeout: async (ms: number) => {
              state.waits.push(ms);
            },
            close: async () => {},
          };
        },
        request: {
          get: async (url: string) => {
            state.requestGets.push(url);
            const script = routes[url] ?? {};
            if (script.requestGetResult === 'timeout') {
              throw new Error('apiRequestContext.get: Timeout 15000ms exceeded.');
            }
            return {
              status: () => script.requestGetStatus ?? script.status ?? 200,
              url: () => script.finalUrl ?? url,
              headers: () => ({
                'content-type': script.contentType ?? 'text/html',
              }),
              body: async () =>
                script.bodyBytes ?? Buffer.from(script.contents?.[0] ?? ''),
            };
          },
        },
        close: async () => {
          state.closedContexts++;
        },
        };
      },
      close: async () => {
        state.closedBrowser = true;
      },
    };
  });

  return { launch, state };
}

describe('createBrowserFetch', () => {
  it('returns rendered HTML with the browser final URL', async () => {
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/news': {
        finalUrl: 'https://www.example.gov.au/news-and-media',
        contents: ['<html><body><main>Rendered index</main></body></html>'],
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/news',
    );

    expect(response.status).toBe(200);
    expect(response.url).toBe('https://www.example.gov.au/news-and-media');
    expect(await response.text()).toContain('Rendered index');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(state.closedContexts).toBe(1);

    await browserFetch.fetchImpl('https://www.example.gov.au/news');
    expect(state.launches).toBe(1);

    await browserFetch.close();
    expect(state.closedBrowser).toBe(true);
  });

  it('returns raw response bytes for non-HTML payloads', async () => {
    const rss = '<?xml version="1.0"?><rss><channel></channel></rss>';
    const { launch } = fakeBrowser({
      'https://www.example.gov.au/rss': {
        contentType: 'application/rss+xml',
        bodyBytes: Buffer.from(rss),
        contents: ['<html><body>viewer chrome</body></html>'],
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/rss',
    );

    expect(await response.text()).toBe(rss);
    expect(response.headers.get('content-type')).toContain(
      'application/rss+xml',
    );
  });

  it('waits out bot challenges and returns the settled content', async () => {
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/news': {
        contents: [
          '<html><body>Checking your browser before accessing</body></html>',
          '<html><body><main>Actual news index</main></body></html>',
        ],
      },
    });
    const browserFetch = createBrowserFetch({
      launch,
      challengeSettleMs: 1234,
    });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/news',
    );

    expect(state.waits).toEqual([1234]);
    expect(await response.text()).toContain('Actual news index');
  });

  it('propagates non-success statuses', async () => {
    const { launch } = fakeBrowser({
      'https://www.example.gov.au/news': {
        status: 403,
        contents: ['<html><body>denied</body></html>'],
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/news',
    );

    expect(response.status).toBe(403);
  });

  it('re-navigates once after a blocked status settles into success', async () => {
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/news': {
        statuses: [403, 200],
        contents: [
          '<html><body>denied</body></html>',
          '<html><body><main>Unblocked index</main></body></html>',
        ],
      },
    });
    const browserFetch = createBrowserFetch({
      launch,
      challengeSettleMs: 2000,
    });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/news',
    );

    expect(state.waits).toEqual([2000]);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Unblocked index');
  });

  it('presents a non-headless user agent matching the browser version', async () => {
    const { launch, state } = fakeBrowser(
      {
        'https://www.example.gov.au/news': {
          contents: ['<html><body>ok</body></html>'],
        },
      },
      '149.0.7827.55',
    );
    const browserFetch = createBrowserFetch({ launch });

    await browserFetch.fetchImpl('https://www.example.gov.au/news');

    const userAgent = state.contextOptions[0]?.userAgent ?? '';
    expect(userAgent).toContain('Chrome/149.0.0.0');
    expect(userAgent).not.toContain('Headless');
  });

  it('retrieves document payloads through the context request API when navigation aborts', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7 fake body');
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/files/policy.pdf': {
        gotoResult: 'abort',
        contentType: 'application/pdf',
        bodyBytes: pdfBytes,
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/files/policy.pdf',
    );

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(state.requestGets).toEqual([
      'https://www.example.gov.au/files/policy.pdf',
    ]);
  });

  it('retries an empty non-HTML navigation body through the request API', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7 nav-empty');
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/files/empty.pdf': {
        contentType: 'application/pdf',
        navigationBodyBytes: Buffer.alloc(0),
        bodyBytes: pdfBytes,
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/files/empty.pdf',
    );

    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(state.requestGets).toEqual([
      'https://www.example.gov.au/files/empty.pdf',
    ]);
  });

  it('re-fetches when the PDF viewer shell masquerades as the document', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7 real document');
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/files/viewer.pdf': {
        contentType: 'application/pdf',
        navigationBodyBytes: Buffer.from(
          '<!doctype html><html><body>pdf viewer</body></html>',
        ),
        bodyBytes: pdfBytes,
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/files/viewer.pdf',
    );

    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(state.requestGets).toEqual([
      'https://www.example.gov.au/files/viewer.pdf',
    ]);
  });

  it('falls back to an in-page fetch when the request API is blocked', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7 akamai guarded');
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/files/guarded.pdf': {
        contentType: 'application/pdf',
        navigationBodyBytes: Buffer.from(
          '<!doctype html><html><body>pdf viewer</body></html>',
        ),
        bodyBytes: pdfBytes,
        requestGetResult: 'timeout',
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/files/guarded.pdf',
    );

    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(state.inPageFetches).toEqual([
      'https://www.example.gov.au/files/guarded.pdf',
    ]);
  });

  it('falls back to an in-page fetch when the request API is challenged', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7 waf challenged');
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/files/challenged.pdf': {
        contentType: 'application/pdf',
        navigationBodyBytes: Buffer.alloc(0),
        bodyBytes: pdfBytes,
        requestGetStatus: 403,
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/files/challenged.pdf',
    );

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(state.inPageFetches).toEqual([
      'https://www.example.gov.au/files/challenged.pdf',
    ]);
  });

  it('throws when navigation yields no response', async () => {
    const { launch } = fakeBrowser({
      'https://www.example.gov.au/news': { gotoResult: 'null' },
    });
    const browserFetch = createBrowserFetch({ launch });

    await expect(
      browserFetch.fetchImpl('https://www.example.gov.au/news'),
    ).rejects.toThrow(/no response/i);
  });

  it('does not launch a browser when closed unused', async () => {
    const { launch, state } = fakeBrowser({});
    const browserFetch = createBrowserFetch({ launch });

    await browserFetch.close();

    expect(state.launches).toBe(0);
  });

  it('integrates with retrieveSource evidence building', async () => {
    const { launch } = fakeBrowser({
      'https://www.example.gov.au/news': {
        finalUrl: 'https://www.example.gov.au/news/index',
        contents: [
          '<html><body><main><a href="/news/ai-item">AI policy item</a></main></body></html>',
        ],
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    const retrieved = await retrieveSource('https://www.example.gov.au/news', {
      fetchImpl: browserFetch.fetchImpl,
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(retrieved.evidence.finalUrl).toBe(
      'https://www.example.gov.au/news/index',
    );
    expect(retrieved.evidence.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(retrieved.body).toContain('AI policy item');
  });
});
