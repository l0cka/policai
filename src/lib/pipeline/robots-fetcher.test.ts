/* @vitest-environment node */

import { EventEmitter } from 'node:events';
import type https from 'node:https';
import { PassThrough } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { robotsFetcher } from './host-gate';
import { ROBOTS_MAX_BYTES } from './robots';

type Reply =
  | { status: number; headers?: Record<string, string>; body?: string | Buffer }
  | 'reset'
  | 'stall';

const ORIGIN = 'https://www.fixture.gov.au';
const ROBOTS = `${ORIGIN}/robots.txt`;
const RULES = 'User-agent: *\nDisallow: /x\n';
const TEXT = { 'content-type': 'text/plain' };

function stubRequests(routes: Record<string, Reply>) {
  const requested: string[] = [];
  const requestImpl = ((parsed: URL, _options: object, onResponse: (response: PassThrough) => void) => {
    const request = new EventEmitter() as EventEmitter & {
      setTimeout: (ms: number, callback: () => void) => typeof request;
      destroy: (error?: Error) => typeof request;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    request.setTimeout = (ms, callback) => {
      timer = setTimeout(callback, ms);
      return request;
    };
    request.destroy = (error) => {
      if (timer) clearTimeout(timer);
      if (error) queueMicrotask(() => request.emit('error', error));
      return request;
    };
    const url = parsed.toString();
    requested.push(url);
    const reply = routes[url] ?? { status: 404 };
    queueMicrotask(() => {
      if (reply === 'stall') return;
      if (reply === 'reset') {
        request.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
        return;
      }
      const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
      response.statusCode = reply.status;
      response.headers = reply.headers ?? {};
      onResponse(response);
      response.end(reply.body ?? '');
    });
    return request;
  }) as unknown as typeof https.get;
  return { requestImpl, requested };
}

function fetcherFor(routes: Record<string, Reply>) {
  const { requestImpl, requested } = stubRequests(routes);
  return {
    requested,
    fetchRobots: robotsFetcher({ requestImpl, resolveHost: async () => ['93.184.216.34'], timeoutMs: 50 }),
  };
}

describe('robotsFetcher maps each transport outcome for the gate', () => {
  it.each<[label: string, routes: Record<string, Reply>, expected: { status: number; body: string } | null]>([
    ['a text robots.txt', { [ROBOTS]: { status: 200, headers: TEXT, body: RULES } }, { status: 200, body: RULES }],
    ['a robots.txt with no content type', { [ROBOTS]: { status: 200, body: RULES } }, { status: 200, body: RULES }],
    ['a robots.txt served as octet-stream', { [ROBOTS]: { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: RULES } }, { status: 200, body: RULES }],
    ['an HTML page', { [ROBOTS]: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><body>Home</body></html>' } }, { status: 200, body: '<html><body>Home</body></html>' }],
    ['a WAF challenge page', { [ROBOTS]: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><script>window.awsWafIntegration=1</script></html>' } }, null],
    ['a body over the 500 KiB cap', { [ROBOTS]: { status: 200, headers: TEXT, body: `${RULES}${'#'.repeat(ROBOTS_MAX_BYTES)}` } }, null],
    ['a 204, an empty robots.txt', { [ROBOTS]: { status: 204 } }, { status: 200, body: '' }],
    ['a 304 without Location', { [ROBOTS]: { status: 304 } }, { status: 304, body: '' }],
    ['a gzip Content-Encoding', { [ROBOTS]: { status: 200, headers: { ...TEXT, 'content-encoding': 'gzip' }, body: RULES } }, null],
    ['a br Content-Encoding', { [ROBOTS]: { status: 200, headers: { ...TEXT, 'content-encoding': 'br' }, body: RULES } }, null],
    ['a gzip body without Content-Encoding', { [ROBOTS]: { status: 200, headers: TEXT, body: gzipSync(RULES) } }, null],
    ['a 403', { [ROBOTS]: { status: 403 } }, { status: 403, body: '' }],
    ['a 404', { [ROBOTS]: { status: 404 } }, { status: 404, body: '' }],
    ['a 429', { [ROBOTS]: { status: 429, headers: { 'retry-after': '3600' } } }, { status: 429, body: '' }],
    ['a 500', { [ROBOTS]: { status: 500 } }, { status: 500, body: '' }],
    ['a 503', { [ROBOTS]: { status: 503 } }, { status: 503, body: '' }],
    ['a redirect on the same host', { [ROBOTS]: { status: 301, headers: { location: '/robots-2.txt' } }, [`${ORIGIN}/robots-2.txt`]: { status: 200, headers: TEXT, body: RULES } }, { status: 200, body: RULES }],
    ['a redirect to the homepage', { [ROBOTS]: { status: 301, headers: { location: '/' } }, [`${ORIGIN}/`]: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>home</html>' } }, { status: 404, body: '' }],
    ['a redirect from https to http', { [ROBOTS]: { status: 301, headers: { location: `http://www.fixture.gov.au/robots.txt` } } }, null],
    ['more than five redirects', Object.fromEntries([ROBOTS, ...[1, 2, 3, 4, 5, 6].map((i) => `${ORIGIN}/r${i}`)].map((url, i) => [url, { status: 302, headers: { location: `/r${i + 1}` } }])), null],
    ['a connection reset', { [ROBOTS]: 'reset' }, null],
    ['a stall past the timeout', { [ROBOTS]: 'stall' }, null],
  ])('%s', async (_label, routes, expected) => {
    const { fetchRobots } = fetcherFor(routes);
    expect(await fetchRobots(ORIGIN)).toEqual(expected);
  });

  it('requests robots.txt with the declared identity and follows no redirect off https', async () => {
    const { fetchRobots, requested } = fetcherFor({
      [ROBOTS]: { status: 301, headers: { location: 'http://www.fixture.gov.au/robots.txt' } },
    });
    await fetchRobots(ORIGIN);
    expect(requested).toEqual([ROBOTS]);
  });

  describe('through the browser when plain HTTP is refused', () => {
    const browser = (reply: { status: number; contentType: string; body: string } | Error) => {
      const calls: string[] = [];
      const browserFetchImpl = (async (input: string | URL | Request) => {
        calls.push(String(input));
        if (reply instanceof Error) throw reply;
        return new Response(reply.status === 204 ? null : reply.body, {
          status: reply.status,
          headers: { 'content-type': reply.contentType },
        });
      }) as typeof fetch;
      return { browserFetchImpl, calls };
    };
    const withBrowser = (routes: Record<string, Reply>, browserFetchImpl: typeof fetch) => {
      const { requestImpl } = stubRequests(routes);
      return robotsFetcher({ requestImpl, resolveHost: async () => ['93.184.216.34'], timeoutMs: 50, browserFetchImpl });
    };

    it.each<[label: string, reply: Reply]>([
      ['a 403', { status: 403 }],
      ['a 401', { status: 401 }],
      ['a connection reset', 'reset'],
    ])('reads the rules through the browser after %s', async (_label, reply) => {
      const { browserFetchImpl, calls } = browser({ status: 200, contentType: 'text/plain', body: RULES });
      expect(await withBrowser({ [ROBOTS]: reply }, browserFetchImpl)(ORIGIN)).toEqual({ status: 200, body: RULES });
      expect(calls).toEqual([ROBOTS]);
    });

    it.each<[label: string, reply: Reply]>([
      ['a 200', { status: 200, headers: TEXT, body: RULES }],
      ['a 404', { status: 404 }],
      ['a 503', { status: 503 }],
    ])('never opens the browser after %s', async (_label, reply) => {
      const { browserFetchImpl, calls } = browser({ status: 200, contentType: 'text/plain', body: '' });
      await withBrowser({ [ROBOTS]: reply }, browserFetchImpl)(ORIGIN);
      expect(calls).toEqual([]);
    });

    it.each<[label: string, reply: { status: number; contentType: string; body: string } | Error, expected: { status: number; body: string }]>([
      ['a challenge page', { status: 200, contentType: 'text/html', body: '<html>Just a moment...</html>' }, { status: 403, body: '' }],
      ['an error', new Error('net::ERR_ABORTED'), { status: 403, body: '' }],
      ['its own 403', { status: 403, contentType: 'text/html', body: '' }, { status: 403, body: '' }],
      ['a 404', { status: 404, contentType: 'text/html', body: '' }, { status: 404, body: '' }],
    ])('keeps a usable answer when the browser returns %s', async (_label, reply, expected) => {
      const { browserFetchImpl } = browser(reply);
      expect(await withBrowser({ [ROBOTS]: { status: 403 } }, browserFetchImpl)(ORIGIN)).toEqual(expected);
    });
  });
});
