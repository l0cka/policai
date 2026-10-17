/* @vitest-environment node */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect, emptyWatchState } from './collect';
import { createHostGate, DEFAULT_MIN_GAP_MS, hostOf, robotsFetcher, type HostGate } from './host-gate';
import { retrieveSource } from './fetch';
import type { WatchSource } from './sources';

const ORIGIN = 'https://www.fixture.gov.au';

const INDEX = `<html><body><main><ul class="news-list">
  <li><a href="/news/ai-one">AI policy one</a></li>
  <li><a href="/news/ai-two">AI policy two</a></li>
  <li><a href="/private/ai-three">AI policy three</a></li>
</ul></main></body></html>`;

const page = (title: string) =>
  `<html><body><main><h1>${title}</h1><p>Official guidance on artificial intelligence policy.</p></main></body></html>`;

interface Fixture {
  server: Server;
  port: number;
  hits: Array<{ path: string; at: number; userAgent: string }>;
  robots: string;
  limitedRemaining: number;
}

function startFixture(robots: string): Promise<Fixture> {
  const fixture: Partial<Fixture> & { hits: Fixture['hits'] } = { hits: [], robots, limitedRemaining: 1 };
  const server = createServer((request, response) => {
    const path = request.url ?? '/';
    fixture.hits.push({ path, at: Date.now(), userAgent: request.headers['user-agent'] ?? '' });
    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'content-type': 'text/html', ...headers });
      response.end(body);
    };
    if (path === '/robots.txt') {
      return send(200, fixture.robots ?? '', { 'content-type': 'text/plain' });
    }
    if (path === '/news') return send(200, INDEX);
    if (path.startsWith('/private/')) return send(200, page('Should never be served'));
    if (path === '/forbidden' || path === '/forbidden/') return send(403, 'blocked');
    if (path === '/limited') {
      if ((fixture.limitedRemaining ?? 0) > 0) {
        fixture.limitedRemaining = (fixture.limitedRemaining ?? 0) - 1;
        return send(429, 'slow down', { 'retry-after': '1' });
      }
      return send(200, page('Rate limited page'));
    }
    if (path.startsWith('/news/')) return send(200, page(`AI policy ${path.slice('/news/'.length)}`));
    return send(404, 'not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ ...(fixture as Fixture), server, port });
    });
  });
}

function loopbackFetch(port: number, starts: number[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    starts.push(Date.now());
    const target = String(input).replace(ORIGIN, `http://127.0.0.1:${port}`);
    const response = await fetch(target, { ...init, redirect: 'manual' });
    Object.defineProperty(response, 'url', { value: String(input) });
    return response;
  }) as typeof fetch;
}

function productionGate(fetchImpl: typeof fetch, minGapMs?: number): HostGate {
  return createHostGate({
    hosts: {},
    refused: new Map(),
    fetchRobots: robotsFetcher(fetchImpl),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...(minGapMs === undefined ? {} : { minGapMs }),
  });
}

const gaps = (starts: number[]) => starts.slice(1).map((at, index) => at - starts[index]);

describe('HostGate against a loopback fixture server', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await startFixture('User-agent: *\nDisallow: /private\n');
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  });

  it('fetches robots.txt with the declared identity and never requests a disallowed path', async () => {
    const fetchImpl = loopbackFetch(fixture.port);
    const gate = productionGate(fetchImpl, 10);
    await retrieveSource(`${ORIGIN}/news`, { fetchImpl, gate, hashLinkedDocuments: false });
    await expect(
      retrieveSource(`${ORIGIN}/private/ai-three`, { fetchImpl, gate, hashLinkedDocuments: false }),
    ).rejects.toMatchObject({ code: 'gate_refused', message: expect.stringContaining('disallowed by robots.txt') });
    expect(fixture.hits.map((hit) => hit.path)).toEqual(['/robots.txt', '/news']);
    expect(fixture.hits[0].userAgent).toBe('Mozilla/5.0 (compatible; Policai/1.0 (+https://policai.org))');
    expect(gate.hosts()[hostOf(new URL(ORIGIN))]?.robots).toMatchObject({ status: 'parsed', disallow: ['/private'] });
  });

  it('starts consecutive requests to one host at least the gap apart', async () => {
    const starts: number[] = [];
    const fetchImpl = loopbackFetch(fixture.port, starts);
    const gate = productionGate(fetchImpl, 300);
    for (const path of ['/news/ai-one', '/news/ai-two', '/news/ai-one']) {
      await retrieveSource(`${ORIGIN}${path}`, { fetchImpl, gate, hashLinkedDocuments: false });
    }
    expect(fixture.hits.map((hit) => hit.path)).toEqual(['/robots.txt', '/news/ai-one', '/news/ai-two', '/news/ai-one']);
    expect(starts).toHaveLength(4);
    for (const gap of gaps(starts)) expect(gap).toBeGreaterThanOrEqual(299);
    expect(gate.waited()[hostOf(new URL(ORIGIN))]).toBeGreaterThanOrEqual(800);
  });

  it('starts the first page request 2 s after the robots fetch by default', async () => {
    const starts: number[] = [];
    const fetchImpl = loopbackFetch(fixture.port, starts);
    const gate = productionGate(fetchImpl);
    await retrieveSource(`${ORIGIN}/news/ai-one`, { fetchImpl, gate, hashLinkedDocuments: false });
    expect(starts).toHaveLength(2);
    expect(gaps(starts)[0]).toBeGreaterThanOrEqual(DEFAULT_MIN_GAP_MS - 1);
  }, 10_000);

  it('waits out a short Retry-After after a 429 and then succeeds', async () => {
    const fetchImpl = loopbackFetch(fixture.port);
    const gate = productionGate(fetchImpl, 10);
    const result = await retrieveSource(`${ORIGIN}/limited`, {
      fetchImpl,
      gate,
      hashLinkedDocuments: false,
      attempts: 2,
      retryDelayMs: 0,
    });
    expect(result.body).toContain('Rate limited page');
    const limited = fixture.hits.filter((hit) => hit.path === '/limited');
    expect(limited).toHaveLength(2);
    expect(limited[1].at - limited[0].at).toBeGreaterThanOrEqual(990);
    expect(gate.hosts()[hostOf(new URL(ORIGIN))]).toMatchObject({ backoffUntil: null, backoffCount: 0 });
  }, 10_000);

  it('runs a collection pass: the disallowed candidate is refused, the rest are collected, and a browser 403 trips the host', async () => {
    const fetchImpl = loopbackFetch(fixture.port);
    const gate = productionGate(fetchImpl, 10);
    const indexSource: WatchSource = {
      id: 'fixture-index',
      name: 'Fixture index',
      jurisdiction: 'federal',
      category: 'government',
      url: `${ORIGIN}/news`,
      kind: 'html-index',
      schedule: 'daily',
      enabled: true,
      automation: 'automatic',
    };
    const log: string[] = [];
    const result = await collect({
      sources: [indexSource],
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl,
      now: () => new Date(),
      hostGate: gate,
      logger: (message) => log.push(message),
    });
    expect(fixture.hits.map((hit) => hit.path)).toEqual(['/robots.txt', '/news', '/news/ai-one', '/news/ai-two']);
    expect(result.meta.collector.sourceResults[0]).toMatchObject({
      status: 'error',
      itemCount: 3,
      candidateCount: 3,
      failureClass: 'robots_disallowed',
      failedUrl: `${ORIGIN}/private/ai-three`,
    });
    expect(result.state.seen[`${ORIGIN}/private/ai-three`]).toMatchObject({
      status: 'failed',
      lastError: `${ORIGIN}/private/ai-three is disallowed by robots.txt for Policai`,
    });
    expect(result.developments.map((d) => d.url).sort()).toEqual([`${ORIGIN}/news/ai-one`, `${ORIGIN}/news/ai-two`]);
    expect(result.state.hosts[hostOf(new URL(ORIGIN))]?.robots?.disallow).toEqual(['/private']);
    expect(log).toContainEqual(expect.stringMatching(/^\[collect\] host gate: waited \d+ ms across 1 host/));

    fixture.hits.length = 0;
    const browserSource: WatchSource = { ...indexSource, id: 'fixture-browser', url: `${ORIGIN}/forbidden`, fetchStrategy: 'browser' };
    const second = await collect({
      sources: [browserSource, { ...indexSource, id: 'fixture-after-trip' }],
      state: result.state,
      existingDevelopments: result.developments,
      fetchImpl,
      browserFetchImpl: fetchImpl,
      now: () => new Date(),
      hostGate: gate,
    });
    expect(fixture.hits.map((hit) => hit.path)).toEqual(['/forbidden']);
    expect(second.meta.collector.sourceResults.map((row) => [row.sourceId, row.status, row.failureClass])).toEqual([
      ['fixture-browser', 'error', 'identity_refused'],
      ['fixture-after-trip', 'error', 'identity_refused'],
    ]);
    expect(second.meta.collector.sourceResults[1].error).toContain('HTTP 403 from www.fixture.gov.au earlier this run');
  }, 15_000);
});

describe('HostGate admit overhead', () => {
  it('costs well under a millisecond per admission once robots are cached', async () => {
    const gate = createHostGate({
      hosts: {},
      refused: new Map(),
      fetchRobots: async () => ({
        status: 200,
        body: `User-agent: *\n${Array.from({ length: 60 }, (_, i) => `Disallow: /core/path-${i}/`).join('\n')}`,
      }),
      now: Date.now,
      sleep: async () => {},
      minGapMs: 0,
    });
    const url = new URL('https://www.fixture.gov.au/news/some-article');
    await gate.admit(url);
    const iterations = 2000;
    const startedAt = process.hrtime.bigint();
    for (let index = 0; index < iterations; index++) await gate.admit(url);
    const perAdmitMicros = Number(process.hrtime.bigint() - startedAt) / 1000 / iterations;
    console.info(`host gate admit: ${perAdmitMicros.toFixed(1)} us per admission (60 rules, cached robots)`);
    expect(perAdmitMicros).toBeLessThan(1000);
  });
});
