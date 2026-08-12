/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserFetch as createBrowserFetchRaw,
  type BrowserLike,
  type BrowserPageLike,
  type BrowserResponseLike,
  type BrowserRouteLike,
  type BrowserWebSocketRouteLike,
  type CreateBrowserFetchOptions,
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
  contentLength?: number;
  /** Redirect and subresource requests issued before goto resolves. */
  extraRequestUrls?: string[];
  webSocketUrls?: string[];
  gotoDelayMs?: number;
  gotoResult?: 'null' | 'abort';
  /** Makes the context request API fail, as Akamai does to non-browser TLS. */
  requestGetResult?: 'timeout';
  /** Status the context request API returns (WAFs 403 non-browser TLS). */
  requestGetStatus?: number;
}

function createBrowserFetch(options: CreateBrowserFetchOptions = {}) {
  return createBrowserFetchRaw({
    resolveHost: async () => ['93.184.216.34'],
    egressProxyFactory: async () => ({
      serverUrl: 'http://127.0.0.1:1',
      close: async () => {},
    }),
    ...options,
  });
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
    contextOptions: [] as Array<
      {
        userAgent?: string;
        serviceWorkers?: 'block';
        proxy?: { server: string };
      } | undefined
    >,
    requestGets: [] as string[],
    inPageFetches: [] as string[],
    routedRequests: [] as string[],
    blockedRequests: [] as string[],
    connectedWebSockets: [] as string[],
    blockedWebSockets: [] as string[],
    loadStateWaits: [] as string[],
    rejectLoadStateWaits: false,
  };

  const launch = vi.fn(async (): Promise<BrowserLike> => {
    state.launches++;
    return {
      ...(browserVersion ? { version: () => browserVersion } : {}),
      newContext: async (contextOptions?: {
        userAgent?: string;
        serviceWorkers?: 'block';
        proxy?: { server: string };
      }) => {
        state.contextOptions.push(contextOptions);
        let routeHandler:
          | ((route: BrowserRouteLike) => Promise<void>)
          | undefined;
        let webSocketHandler:
          | ((route: BrowserWebSocketRouteLike) => Promise<void>)
          | undefined;
        const dispatchRequest = async (requestUrl: string) => {
          state.routedRequests.push(requestUrl);
          if (!routeHandler) return;
          let blocked = false;
          await routeHandler({
            request: () => ({ url: () => requestUrl }),
            continue: async () => {},
            abort: async () => {
              blocked = true;
              state.blockedRequests.push(requestUrl);
            },
          });
          if (blocked) {
            throw new Error(`net::ERR_BLOCKED_BY_CLIENT at ${requestUrl}`);
          }
        };
        const dispatchWebSocket = async (socketUrl: string) => {
          if (!webSocketHandler) return;
          await webSocketHandler({
            url: () => socketUrl,
            connectToServer: () => {
              state.connectedWebSockets.push(socketUrl);
              return {};
            },
            close: async () => {
              state.blockedWebSockets.push(socketUrl);
            },
          });
        };
        return {
        route: async (_pattern: string, handler: (route: BrowserRouteLike) => Promise<void>) => {
          routeHandler = handler;
        },
        routeWebSocket: async (
          _pattern: string,
          handler: (route: BrowserWebSocketRouteLike) => Promise<void>,
        ) => {
          webSocketHandler = handler;
        },
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
              await dispatchRequest(url);
              if (currentUrl !== url) await dispatchRequest(currentUrl);
              for (const requestUrl of script.extraRequestUrls ?? []) {
                await dispatchRequest(requestUrl);
              }
              for (const socketUrl of script.webSocketUrls ?? []) {
                await dispatchWebSocket(socketUrl);
              }
              if (script.gotoDelayMs) {
                await new Promise((resolve) =>
                  setTimeout(resolve, script.gotoDelayMs),
                );
              }
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
                  ...(script.contentLength === undefined
                    ? {}
                    : { 'content-length': String(script.contentLength) }),
                }),
              };
            },
            url: () => currentUrl,
            // Stands in for an in-page same-origin fetch of the arg URL.
            evaluate: async (_fn: unknown, arg: unknown) => {
              const options = arg as {
                target?: string;
                byteLimit: number;
              };
              if (options.target) {
                const target = options.target;
                state.inPageFetches.push(target);
                await dispatchRequest(target);
                const targetScript = routes[target] ?? {};
                const payload = targetScript.bodyBytes ?? Buffer.alloc(0);
                if (
                  (targetScript.contentLength ?? payload.byteLength) >
                  options.byteLimit
                ) {
                  throw new Error(
                    `Source response exceeds ${options.byteLimit} byte limit`,
                  );
                }
                return {
                  status: targetScript.status ?? 200,
                  contentType: targetScript.contentType ?? 'text/html',
                  finalUrl: targetScript.finalUrl ?? target,
                  base64Chunks: [payload.toString('base64')],
                } as never;
              }
              const contents = script.contents ?? [''];
              const index = Math.max(0, gotoIndex - 1) + readsInNavigation;
              readsInNavigation++;
              const content = contents[Math.min(index, contents.length - 1)];
              if (Buffer.byteLength(content, 'utf8') > options.byteLimit) {
                throw new Error(
                  `Source response exceeds ${options.byteLimit} byte limit`,
                );
              }
              return content as never;
            },
            waitForTimeout: async (ms: number) => {
              state.waits.push(ms);
            },
            waitForLoadState: async (loadState: string) => {
              state.loadStateWaits.push(loadState);
              if (state.rejectLoadStateWaits) {
                throw new Error('page.waitForLoadState: Timeout exceeded.');
              }
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
    expect(state.contextOptions[0]?.serviceWorkers).toBe('block');
    expect(state.contextOptions[0]?.proxy?.server).toBe(
      'http://127.0.0.1:1',
    );
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])('rejects an official hostname resolving to blocked address %s before launch', async (address) => {
    const { launch, state } = fakeBrowser({});
    const browserFetch = createBrowserFetch({
      launch,
      resolveHost: async () => [address],
    });

    await expect(
      browserFetch.fetchImpl('https://www.example.gov.au/news'),
    ).rejects.toThrow(/blocked network address/i);
    expect(state.launches).toBe(0);
  });

  it('blocks private redirects and subresources before Chromium continues them', async () => {
    const sourceUrl = 'https://www.example.gov.au/news';
    const privateUrl = 'https://metadata.example.gov.au/latest/meta-data';
    const { launch, state } = fakeBrowser({
      [sourceUrl]: {
        extraRequestUrls: [privateUrl],
        contents: ['<html><body>never returned</body></html>'],
      },
    });
    const browserFetch = createBrowserFetch({
      launch,
      resolveHost: async (hostname) =>
        hostname === 'metadata.example.gov.au'
          ? ['169.254.169.254']
          : ['93.184.216.34'],
    });

    await expect(browserFetch.fetchImpl(sourceUrl)).rejects.toThrow(
      /blocked_by_client/i,
    );
    expect(state.blockedRequests).toEqual([privateUrl]);
  });

  it('blocks private WebSocket destinations and permits public secure sockets', async () => {
    const sourceUrl = 'https://www.example.gov.au/news';
    const privateSocket = 'wss://internal.example.gov.au/events';
    const publicSocket = 'wss://updates.example.gov.au/events';
    const { launch, state } = fakeBrowser({
      [sourceUrl]: {
        webSocketUrls: [privateSocket, publicSocket],
        contents: ['<html><body>ok</body></html>'],
      },
    });
    const browserFetch = createBrowserFetch({
      launch,
      resolveHost: async (hostname) =>
        hostname === 'internal.example.gov.au'
          ? ['10.0.0.5']
          : ['93.184.216.34'],
    });

    await browserFetch.fetchImpl(sourceUrl);

    expect(state.blockedWebSockets).toEqual([privateSocket]);
    expect(state.connectedWebSockets).toEqual([publicSocket]);
  });

  it('retrieves document payloads through a bounded in-page stream when navigation aborts', async () => {
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
    expect(state.inPageFetches).toEqual([
      'https://www.example.gov.au/files/policy.pdf',
    ]);
  });

  it('retrieves raw non-HTML bytes through the bounded in-page stream', async () => {
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
    expect(state.inPageFetches).toEqual([
      'https://www.example.gov.au/files/empty.pdf',
    ]);
  });

  it('rejects an oversized declared browser response before reading its body', async () => {
    const url = 'https://www.example.gov.au/files/large.pdf';
    const { launch, state } = fakeBrowser({
      [url]: {
        contentType: 'application/pdf',
        contentLength: 11,
        bodyBytes: Buffer.from('small'),
      },
    });
    const browserFetch = createBrowserFetch({ launch, maxResponseBytes: 10 });

    await expect(browserFetch.fetchImpl(url)).rejects.toThrow(
      /exceeds 10 byte limit/i,
    );
    expect(state.inPageFetches).toEqual([]);
  });

  it('aborts a chunked browser payload once streamed bytes exceed the limit', async () => {
    const url = 'https://www.example.gov.au/files/chunked.pdf';
    const { launch } = fakeBrowser({
      [url]: {
        contentType: 'application/pdf',
        bodyBytes: Buffer.from('eleven-byte'),
      },
    });
    const browserFetch = createBrowserFetch({ launch, maxResponseBytes: 10 });

    await expect(browserFetch.fetchImpl(url)).rejects.toThrow(
      /exceeds 10 byte limit/i,
    );
  });

  it('rejects rendered HTML that exceeds the response budget', async () => {
    const url = 'https://www.example.gov.au/news';
    const { launch } = fakeBrowser({
      [url]: { contents: ['<html><body>too large</body></html>'] },
    });
    const browserFetch = createBrowserFetch({ launch, maxResponseBytes: 12 });

    await expect(browserFetch.fetchImpl(url)).rejects.toThrow(
      /exceeds 12 byte limit/i,
    );
  });

  it('propagates an AbortSignal and closes the active browser context', async () => {
    const url = 'https://www.example.gov.au/news';
    const { launch, state } = fakeBrowser({
      [url]: {
        gotoDelayMs: 100,
        contents: ['<html><body>late response</body></html>'],
      },
    });
    const browserFetch = createBrowserFetch({ launch });
    const controller = new AbortController();
    const pending = browserFetch.fetchImpl(url, { signal: controller.signal });

    await vi.waitFor(() => expect(state.launches).toBe(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.closedContexts).toBeGreaterThan(0);
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
    expect(state.inPageFetches).toEqual([
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

  it('lets client-rendered pages settle to network idle before reading', async () => {
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/news': {
        contents: [
          '<html><body><main><a href="/news/ai-item">AI policy item</a></main></body></html>',
        ],
      },
    });
    const browserFetch = createBrowserFetch({ launch });

    await browserFetch.fetchImpl('https://www.example.gov.au/news');

    expect(state.loadStateWaits).toEqual(['networkidle']);
  });

  it('tolerates pages that never reach network idle', async () => {
    const { launch, state } = fakeBrowser({
      'https://www.example.gov.au/news': {
        contents: [
          '<html><body><main>Long-polling page content</main></body></html>',
        ],
      },
    });
    state.rejectLoadStateWaits = true;
    const browserFetch = createBrowserFetch({ launch });

    const response = await browserFetch.fetchImpl(
      'https://www.example.gov.au/news',
    );

    expect(await response.text()).toContain('Long-polling page content');
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
