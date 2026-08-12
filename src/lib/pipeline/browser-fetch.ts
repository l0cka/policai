import {
  assertContentLengthWithinLimit,
  assertSafeSourceUrl,
  DEFAULT_MAX_RESPONSE_BYTES,
  looksLikeBotChallenge,
  resolveHostAddresses,
  SourceFetchError,
} from './fetch';
import {
  createBrowserEgressProxy,
  type BrowserEgressProxy,
} from './browser-egress-proxy';

/**
 * Headless-browser retriever with the fetch signature, so `retrieveSource`
 * can run its usual evidence, hashing and safety checks over browser-rendered
 * content. Exists because several official hosts (GovCMS behind Akamai, APH,
 * AWS WAF fronted state sites) reject or stall plain HTTP clients.
 *
 * The Playwright dependency is loaded lazily on first use; environments
 * without it can still run the collector, just without the browser fallback.
 */

export interface BrowserResponseLike {
  status(): number;
  url(): string;
  headers(): Record<string, string>;
}

export interface BrowserPageLike {
  goto(
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded'; timeout?: number },
  ): Promise<BrowserResponseLike | null>;
  url(): string;
  evaluate<Arg, Result>(
    fn: (arg: Arg) => Result | Promise<Result>,
    arg: Arg,
  ): Promise<Result>;
  waitForTimeout(milliseconds: number): Promise<void>;
  waitForLoadState?(
    state: 'networkidle',
    options?: { timeout?: number },
  ): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserRouteLike {
  request(): { url(): string };
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

export interface BrowserWebSocketRouteLike {
  url(): string;
  connectToServer(): unknown;
  close(options?: { code?: number; reason?: string }): Promise<void>;
}

export interface BrowserContextLike {
  newPage(): Promise<BrowserPageLike>;
  route(
    pattern: string,
    handler: (route: BrowserRouteLike) => Promise<void>,
  ): Promise<unknown>;
  routeWebSocket?(
    pattern: string,
    handler: (route: BrowserWebSocketRouteLike) => Promise<void>,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface BrowserLike {
  newContext(options?: {
    userAgent?: string;
    locale?: string;
    serviceWorkers?: 'block';
    proxy?: { server: string };
  }): Promise<BrowserContextLike>;
  version?(): string;
  close(): Promise<void>;
}

export interface BrowserFetch {
  fetchImpl: typeof fetch;
  close(): Promise<void>;
}

export interface CreateBrowserFetchOptions {
  launch?: () => Promise<BrowserLike>;
  /** How long to let a bot-challenge interstitial settle before re-reading. */
  challengeSettleMs?: number;
  navigationTimeoutMs?: number;
  maxResponseBytes?: number;
  resolveHost?: (hostname: string) => Promise<string[]>;
  egressProxyFactory?: (
    maxTunnelBytes: number,
  ) => Promise<BrowserEgressProxy>;
}

const DEFAULT_CHALLENGE_SETTLE_MS = 5_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
/**
 * Client-rendered indexes populate after the load event, and slower CI
 * hardware widens that window; bounded so long-polling pages cannot stall.
 */
const NETWORK_IDLE_SETTLE_MS = 5_000;
const BROWSER_TRAFFIC_OVERHEAD_BYTES = 4 * 1024 * 1024;

const BROWSER_LOCALE = 'en-AU';
/** Statuses WAF interstitials return before a challenge cookie is granted. */
const CHALLENGE_STATUSES = new Set([403, 429, 503]);

async function launchPlaywrightChromium(): Promise<BrowserLike> {
  const playwright = await import('playwright-core');
  // Full Chromium in new-headless mode: the lighter headless shell trips
  // HTTP2 protocol errors and WAF blocks on Akamai-fronted GovCMS hosts.
  const browser = await playwright.chromium.launch({
    headless: true,
    channel: 'chromium',
    args: [
      '--disable-background-networking',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return {
    newContext: (options) => browser.newContext(options),
    version: () => browser.version(),
    close: () => browser.close(),
  };
}

function userAgentPlatform(): string {
  if (process.platform === 'darwin') return 'Macintosh; Intel Mac OS X 10_15_7';
  if (process.platform === 'win32') return 'Windows NT 10.0; Win64; x64';
  return 'X11; Linux x86_64';
}

/**
 * Official sources serve identical public content to any modern browser; the
 * default headless user agent advertises "HeadlessChrome", which host-side
 * heuristics reject. Present the reduced Chrome user agent for the same
 * browser build so client-hint headers stay consistent with the UA string.
 */
function browserUserAgent(browser: BrowserLike): string {
  const majorVersion = Number.parseInt(browser.version?.() ?? '', 10);
  const chromeVersion = Number.isFinite(majorVersion)
    ? `${majorVersion}.0.0.0`
    : '126.0.0.0';
  return `Mozilla/5.0 (${userAgentPlatform()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

function isHtmlContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.includes('html') || normalized === '';
}

/** Navigations Chromium hands to the download manager instead of rendering. */
function isDownloadNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('net::ERR_ABORTED') ||
    message.includes('Download is starting')
  );
}

function responseHeaderSubset(
  responseHeaders: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': responseHeaders['content-type'] ?? 'text/html',
  };
  for (const key of ['content-length', 'etag', 'last-modified'] as const) {
    const value = responseHeaders[key];
    if (value) headers[key] = value;
  }
  return headers;
}

/**
 * Same-origin fetch executed inside the page, using the browser's own
 * network stack — the only client some WAF-fronted hosts accept. The page
 * must already be on the target's origin (the document navigation put it
 * there, even when Chromium substituted its viewer shell).
 */
async function fetchViaPage(
  page: BrowserPageLike,
  url: string,
  navigationTimeoutMs: number,
  maxResponseBytes: number,
): Promise<Response> {
  const origin = new URL(url).origin;
  if (!page.url().startsWith(origin)) {
    await page.goto(origin, {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeoutMs,
    });
  }
  let result: {
    status: number;
    contentType: string;
    finalUrl: string;
    base64Chunks: string[];
  };
  try {
    result = await page.evaluate(async ({ target, byteLimit }) => {
      const response = await fetch(target, {
        credentials: 'include',
        redirect: 'follow',
      });
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
        await response.body?.cancel();
        throw new Error(`Source response exceeds ${byteLimit} byte limit`);
      }
      if (!response.body) {
        return {
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          finalUrl: response.url || target,
          base64Chunks: [],
        };
      }

      const reader = response.body.getReader();
      const base64Chunks: string[] = [];
      let received = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > byteLimit) {
            await reader.cancel();
            throw new Error(`Source response exceeds ${byteLimit} byte limit`);
          }
          let binary = '';
          const chunkSize = 0x8000;
          for (let index = 0; index < value.length; index += chunkSize) {
            binary += String.fromCharCode(
              ...value.subarray(index, index + chunkSize),
            );
          }
          base64Chunks.push(btoa(binary));
        }
      } finally {
        reader.releaseLock();
      }
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        finalUrl: response.url || target,
        base64Chunks,
      };
    }, { target: url, byteLimit: maxResponseBytes });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(`exceeds ${maxResponseBytes} byte limit`)
    ) {
      throw new SourceFetchError(
        `Source response exceeds ${maxResponseBytes} byte limit`,
        { retryable: false, cause: error },
      );
    }
    throw error;
  }
  const chunks = result.base64Chunks.map((chunk) => Buffer.from(chunk, 'base64'));
  const payload = Buffer.concat(chunks);
  return toFetchResponse(
    result.status,
    result.finalUrl,
    new Uint8Array(payload),
    {
      'content-type': result.contentType || 'application/octet-stream',
      'content-length': String(payload.byteLength),
    },
  );
}

async function fetchDocumentPayload(
  page: BrowserPageLike,
  url: string,
  navigationTimeoutMs: number,
  maxResponseBytes: number,
): Promise<Response> {
  return await fetchViaPage(
    page,
    url,
    navigationTimeoutMs,
    maxResponseBytes,
  );
}

async function readBoundedPageContent(
  page: BrowserPageLike,
  maxResponseBytes: number,
): Promise<string> {
  try {
    return await page.evaluate(({ byteLimit }) => {
      const html = document.documentElement?.outerHTML ?? '';
      if (new TextEncoder().encode(html).byteLength > byteLimit) {
        throw new Error(`Source response exceeds ${byteLimit} byte limit`);
      }
      return html;
    }, { byteLimit: maxResponseBytes });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(`exceeds ${maxResponseBytes} byte limit`)
    ) {
      throw new SourceFetchError(
        `Source response exceeds ${maxResponseBytes} byte limit`,
        { retryable: false, cause: error },
      );
    }
    throw error;
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal | null | undefined,
  abort: () => Promise<void>,
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) {
    await abort();
    throw abortReason(signal);
  }
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      void abort().finally(() => reject(abortReason(signal)));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function toFetchResponse(
  status: number,
  finalUrl: string,
  body: BodyInit,
  headers: Record<string, string>,
): Response {
  const response = new Response(status === 204 ? null : body, {
    status,
    headers,
  });
  // Constructed Responses report an empty url; shadow the prototype getter so
  // retrieveSource sees the browser's post-redirect destination.
  Object.defineProperty(response, 'url', { value: finalUrl });
  return response;
}

export function createBrowserFetch(
  options: CreateBrowserFetchOptions = {},
): BrowserFetch {
  const launch = options.launch ?? launchPlaywrightChromium;
  const challengeSettleMs =
    options.challengeSettleMs ?? DEFAULT_CHALLENGE_SETTLE_MS;
  const navigationTimeoutMs =
    options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const resolveHost = options.resolveHost ?? resolveHostAddresses;
  const egressProxyFactory =
    options.egressProxyFactory ??
    ((maxTunnelBytes: number) =>
      createBrowserEgressProxy({ maxTunnelBytes }));

  let browserPromise: Promise<BrowserLike> | null = null;
  const getBrowser = (): Promise<BrowserLike> => {
    browserPromise ??= launch();
    return browserPromise;
  };

  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    await assertSafeSourceUrl(url, resolveHost, 'official');
    if (init?.signal?.aborted) throw abortReason(init.signal);
    const browser = await getBrowser();
    const egressProxy = await egressProxyFactory(
      maxResponseBytes + BROWSER_TRAFFIC_OVERHEAD_BYTES,
    );
    let context: BrowserContextLike | undefined;
    try {
      context = await browser.newContext({
        userAgent: browserUserAgent(browser),
        locale: BROWSER_LOCALE,
        serviceWorkers: 'block',
        proxy: { server: egressProxy.serverUrl },
      });
      await context.route('**/*', async (route) => {
        try {
          await assertSafeSourceUrl(
            route.request().url(),
            resolveHost,
            'public-https',
          );
          await route.continue();
        } catch {
          await route.abort('blockedbyclient');
        }
      });
      await context.routeWebSocket?.('**/*', async (route) => {
        const socketUrl = route.url();
        const validationUrl = socketUrl.replace(/^wss:/i, 'https:');
        try {
          await assertSafeSourceUrl(
            validationUrl,
            resolveHost,
            'public-https',
          );
          route.connectToServer();
        } catch {
          await route.close({ code: 1008, reason: 'Blocked destination' });
        }
      });

      const operation = (async () => {
        const page = await context.newPage();
        let navigation: BrowserResponseLike | null;
        try {
          navigation = await page.goto(url, {
            waitUntil: 'load',
            timeout: navigationTimeoutMs,
          });
        } catch (error) {
          if (!isDownloadNavigationError(error)) throw error;
          // Chromium aborts navigations it treats as downloads; retrieve the
          // bytes through a same-origin streamed fetch with the same cookies.
          return await fetchDocumentPayload(
            page,
            url,
            navigationTimeoutMs,
            maxResponseBytes,
          );
        }
        if (!navigation) {
          throw new Error(`Browser navigation to ${url} produced no response`);
        }
        if (
          CHALLENGE_STATUSES.has(navigation.status()) &&
          isHtmlContentType(navigation.headers()['content-type'] ?? '') &&
          challengeSettleMs > 0
        ) {
          // WAF interstitials run JS, set a clearance cookie, and only then
          // serve content; give that a beat and re-navigate once.
          await page.waitForTimeout(challengeSettleMs);
          navigation =
            (await page.goto(url, {
              waitUntil: 'load',
              timeout: navigationTimeoutMs,
            })) ?? navigation;
        }

        await assertSafeSourceUrl(
          navigation.url(),
          resolveHost,
          'public-https',
        );
        const status = navigation.status();
        const headers = responseHeaderSubset(navigation.headers());
        assertContentLengthWithinLimit(
          headers['content-length'],
          maxResponseBytes,
        );
        const contentType = headers['content-type'];

        if (!isHtmlContentType(contentType)) {
          return await fetchDocumentPayload(
            page,
            navigation.url(),
            navigationTimeoutMs,
            maxResponseBytes,
          );
        }

        await page
          .waitForLoadState?.('networkidle', { timeout: NETWORK_IDLE_SETTLE_MS })
          .catch(() => {
            // Pages that never go idle (long polling, analytics beacons) are
            // read as-is after the bounded settle window.
          });
        let body = await readBoundedPageContent(page, maxResponseBytes);
        if (looksLikeBotChallenge(body) && challengeSettleMs > 0) {
          await page.waitForTimeout(challengeSettleMs);
          body = await readBoundedPageContent(page, maxResponseBytes);
        }
        return toFetchResponse(status, page.url(), body, headers);
      })();
      return await raceWithAbort(
        operation,
        init?.signal,
        () => context?.close() ?? Promise.resolve(),
      );
    } finally {
      if (context) {
        await context.close().catch(() => {
          // Abort-driven closure can race normal cleanup.
        });
      }
      await egressProxy.close();
    }
  }) as typeof fetch;

  return {
    fetchImpl,
    close: async () => {
      if (!browserPromise) return;
      const browser = await browserPromise;
      browserPromise = null;
      await browser.close();
    },
  };
}
