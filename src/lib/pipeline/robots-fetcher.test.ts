/* @vitest-environment node */

import { EventEmitter } from 'node:events';
import type https from 'node:https';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { robotsFetcher } from './host-gate';
import { ROBOTS_MAX_BYTES } from './robots';

type Reply = { status: number; headers?: Record<string, string>; body?: string } | 'reset' | 'stall';

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
});
