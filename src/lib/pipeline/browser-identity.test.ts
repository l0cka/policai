/* @vitest-environment node */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBrowserFetch, type BrowserLike } from './browser-fetch';
import { COLLECTOR_IDENTITY_TOKEN, destinationCollectorIdentity, identityAuthorityFor } from './identity';
import { WATCH_SOURCES } from './sources';

const sourceUrl = 'https://www.industry.gov.au/publications?pub-topic=2963';
const authority = { sourceId: 'industry-ai-publications', sourceUrl, until: '2026-10-21' };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:59:59.999Z')); });
afterEach(() => vi.useRealTimers());

function fixture(urls: string[], download = false, noCdp = false, expire = false) {
  const headers: Array<{ url: string; userAgent: string }> = [];
  let handler: (event: unknown) => Promise<void>;
  let currentUrl = sourceUrl;
  const close = vi.fn(async () => {});
  const send = vi.fn(async (method: string, params?: { headers?: Array<{ name: string; value: string }>; requestId?: string }) => {
    if (method === 'Fetch.continueRequest') headers.push({ url: params!.requestId!, userAgent: params!.headers!.find(h => h.name.toLowerCase() === 'user-agent')!.value });
  });
  const dispatch = async (url: string) => {
    if (handler) await handler({ requestId: url, request: { url, headers: { 'User-Agent': 'untrusted override', Accept: '*/*' } } });
  };
  const page = {
    goto: vi.fn(async () => {
      for (const [index, url] of urls.entries()) {
        if (expire && index > 0) vi.setSystemTime(new Date('2026-10-20T13:00:00.000Z'));
        await dispatch(url);
      }
      if (download) throw new Error('Download is starting');
      currentUrl = urls[0];
      return { status: () => 200, url: () => currentUrl, headers: () => ({ 'content-type': 'text/html' }) };
    }),
    url: () => currentUrl,
    evaluate: async (_fn: unknown, arg: { target?: string }) => {
      if (!arg.target) return '<main>AI policy</main>';
      await dispatch(arg.target);
      await dispatch('https://www.oaic.gov.au/document.pdf');
      return { status: 200, contentType: 'application/pdf', finalUrl: arg.target, base64Chunks: [Buffer.from('%PDF-1.4 fixture').toString('base64')] };
    },
    waitForTimeout: async () => {}, close,
  };
  const newContext = vi.fn(async () => ({
    newPage: async () => page,
    route: async () => {},
    ...(noCdp ? {} : { newCDPSession: async () => ({ on: (_event: string, callback: typeof handler) => { handler = callback; }, send }) }),
    close,
  }));
  const proxyClose = vi.fn(async () => {});
  const browser = createBrowserFetch({
    launch: async () => ({ newContext, close }) as unknown as BrowserLike,
    resolveHost: async () => ['93.184.216.34'],
    egressProxyFactory: async () => ({ serverUrl: 'http://127.0.0.1:1', close: proxyClose }),
  });
  return { browser, newContext, headers, send, page, close, proxyClose };
}

it('defaults the context to declared and scopes each browser redirect/subrequest before continuation', async () => {
  expect(identityAuthorityFor(WATCH_SOURCES.find(s => s.id === authority.sourceId)!)).toEqual(authority);
  expect(new Date().toISOString()).toBe('2026-10-20T12:59:59.999Z');
  expect(destinationCollectorIdentity(authority, sourceUrl)).toBe('exempt');
  const urls = [sourceUrl, `${sourceUrl}/same-origin`, 'https://www.oaic.gov.au/redirect', 'https://cdn.example.org/script.js'];
  const f = fixture(urls);
  await f.browser.fetchImpl(sourceUrl, { identityAuthority: authority } as RequestInit);
  expect(f.newContext).toHaveBeenCalledWith(expect.objectContaining({ userAgent: expect.stringContaining(COLLECTOR_IDENTITY_TOKEN), serviceWorkers: 'block' }));
  expect(f.headers.map(h => h.userAgent.includes(COLLECTOR_IDENTITY_TOKEN))).toEqual([false, false, true, true]);
  expect(f.send).toHaveBeenCalledWith('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await f.browser.close();
  expect(f.proxyClose).toHaveBeenCalledOnce();
});

it('rechecks the clock for browser-managed redirects and subrequests', async () => {
  const f = fixture([sourceUrl, `${sourceUrl}/redirect`], false, false, true);
  await f.browser.fetchImpl(sourceUrl, { identityAuthority: authority } as RequestInit);
  expect(f.headers.map(h => h.userAgent.includes(COLLECTOR_IDENTITY_TOKEN))).toEqual([false, true]);
  await f.browser.close();
});

it('covers download navigation and in-page fetch redirects with the same interceptor', async () => {
  const f = fixture([sourceUrl], true);
  await f.browser.fetchImpl(sourceUrl, { identityAuthority: authority } as RequestInit);
  expect(f.headers.map(h => h.userAgent.includes(COLLECTOR_IDENTITY_TOKEN))).toEqual([false, false, true]);
  await f.browser.close();
});

it('fails closed before navigation when scoped interception is unavailable', async () => {
  const f = fixture([sourceUrl], false, true);
  await expect(f.browser.fetchImpl(sourceUrl, { identityAuthority: authority } as RequestInit)).rejects.toThrow(/identity.*interception/i);
  expect(f.page.goto).not.toHaveBeenCalled();
  expect(f.proxyClose).toHaveBeenCalledOnce();
  expect(f.close).toHaveBeenCalled();
  await f.browser.close();
});
