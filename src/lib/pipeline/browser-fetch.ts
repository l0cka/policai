import { looksLikeBotChallenge } from './fetch';

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
  body(): Promise<Buffer>;
}

export interface BrowserPageLike {
  goto(
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded'; timeout?: number },
  ): Promise<BrowserResponseLike | null>;
  content(): Promise<string>;
  url(): string;
  evaluate<Arg, Result>(
    fn: (arg: Arg) => Result | Promise<Result>,
    arg: Arg,
  ): Promise<Result>;
  waitForTimeout(milliseconds: number): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserContextLike {
  newPage(): Promise<BrowserPageLike>;
  /** Non-rendering HTTP client sharing the context's cookies and identity. */
  request: {
    get(
      url: string,
      options?: { timeout?: number },
    ): Promise<BrowserResponseLike>;
  };
  close(): Promise<void>;
}

export interface BrowserLike {
  newContext(options?: {
    userAgent?: string;
    locale?: string;
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
}

const DEFAULT_CHALLENGE_SETTLE_MS = 5_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;

const BROWSER_LOCALE = 'en-AU';
/** Statuses WAF interstitials return before a challenge cookie is granted. */
const CHALLENGE_STATUSES = new Set([403, 429, 503]);

async function launchPlaywrightChromium(): Promise<BrowserLike> {
  const playwright = await import('playwright-core');
  // Full Chromium in new-headless mode: the lighter headless shell trips
  // HTTP2 protocol errors and WAF blocks on Akamai-fronted GovCMS hosts.
  return playwright.chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--disable-blink-features=AutomationControlled'],
  });
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
  for (const key of ['etag', 'last-modified'] as const) {
    const value = responseHeaders[key];
    if (value) headers[key] = value;
  }
  return headers;
}

/** Fail fast so blocked hosts fall through to the in-page fetch. */
const CONTEXT_REQUEST_TIMEOUT_MS = 15_000;

async function fetchViaContextRequest(
  context: BrowserContextLike,
  url: string,
): Promise<Response> {
  const apiResponse = await context.request.get(url, {
    timeout: CONTEXT_REQUEST_TIMEOUT_MS,
  });
  return toFetchResponse(
    apiResponse.status(),
    apiResponse.url(),
    new Uint8Array(await apiResponse.body()),
    responseHeaderSubset(apiResponse.headers()),
  );
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
): Promise<Response> {
  const origin = new URL(url).origin;
  if (!page.url().startsWith(origin)) {
    await page.goto(origin, {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeoutMs,
    });
  }
  const result = await page.evaluate(async (target: string) => {
    const response = await fetch(target, { credentials: 'include' });
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < buffer.length; index += chunkSize) {
      binary += String.fromCharCode(
        ...buffer.subarray(index, index + chunkSize),
      );
    }
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      base64: btoa(binary),
    };
  }, url);
  return toFetchResponse(
    result.status,
    url,
    new Uint8Array(Buffer.from(result.base64, 'base64')),
    {
      'content-type': result.contentType || 'application/octet-stream',
    },
  );
}

async function fetchDocumentPayload(
  context: BrowserContextLike,
  page: BrowserPageLike,
  url: string,
  navigationTimeoutMs: number,
): Promise<Response> {
  try {
    const response = await fetchViaContextRequest(context, url);
    // WAFs that block the request client's non-browser TLS answer with a
    // challenge status; only the in-page fetch presents as the real browser.
    if (!CHALLENGE_STATUSES.has(response.status)) return response;
  } catch {
    // Timeouts and protocol failures fall through to the in-page fetch.
  }
  return await fetchViaPage(page, url, navigationTimeoutMs);
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

  let browserPromise: Promise<BrowserLike> | null = null;
  const getBrowser = (): Promise<BrowserLike> => {
    browserPromise ??= launch();
    return browserPromise;
  };

  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: browserUserAgent(browser),
      locale: BROWSER_LOCALE,
    });
    try {
      const page = await context.newPage();
      let navigation: BrowserResponseLike | null;
      try {
        navigation = await page.goto(url, {
          waitUntil: 'load',
          timeout: navigationTimeoutMs,
        });
      } catch (error) {
        if (!isDownloadNavigationError(error)) throw error;
        // Chromium aborts navigations it treats as downloads (PDFs, Word
        // documents); retrieve those without rendering.
        return await fetchDocumentPayload(context, page, url, navigationTimeoutMs);
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

      const status = navigation.status();
      const headers = responseHeaderSubset(navigation.headers());
      const contentType = headers['content-type'];

      if (!isHtmlContentType(contentType)) {
        const payload = await navigation.body();
        const declaresBinaryDocument =
          /pdf|msword|wordprocessingml|rtf|octet-stream/.test(
            contentType.toLowerCase(),
          );
        const looksLikeMarkup = payload
          .toString('utf8', 0, Math.min(payload.length, 64))
          .trimStart()
          .startsWith('<');
        if (payload.length === 0 || (declaresBinaryDocument && looksLikeMarkup)) {
          // Chromium substitutes its own viewer shell (or an empty body via
          // the download manager) for document navigations; re-fetch the raw
          // bytes without rendering.
          return await fetchDocumentPayload(
            context,
            page,
            url,
            navigationTimeoutMs,
          );
        }
        return toFetchResponse(
          status,
          navigation.url(),
          new Uint8Array(payload),
          headers,
        );
      }

      let body = await page.content();
      if (looksLikeBotChallenge(body) && challengeSettleMs > 0) {
        await page.waitForTimeout(challengeSettleMs);
        body = await page.content();
      }
      return toFetchResponse(status, page.url(), body, headers);
    } finally {
      await context.close();
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
