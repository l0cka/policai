/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { classifyFailure } from './failure';
import {
  BACKOFF_CAP_MS,
  createHostGate,
  DEFAULT_MIN_GAP_MS,
  HOST_RETENTION_MS,
  type HostGateDeps,
  type HostRecord,
  hostOf,
  MAX_WAIT_MS,
  ROBOTS_RULES_CAP,
  ROBOTS_SITEMAPS_CAP,
  ROBOTS_TTL_MS,
  type RobotsRecord,
} from './host-gate';

const START = Date.parse('2026-10-20T19:30:00.000Z');
const HOUR = 60 * 60 * 1000;
const A = 'https://www.alpha.gov.au';
const B = 'https://www.beta.gov.au';

type Robots = Record<string, { status: number; body: string } | null>;

function harness(
  robots: Robots = {},
  overrides: Partial<HostGateDeps> = {},
) {
  let clock = START;
  const sleeps: number[] = [];
  const robotsCalls: string[] = [];
  const deps: HostGateDeps = {
    hosts: {},
    refused: new Map(),
    fetchRobots: async (origin) => {
      robotsCalls.push(origin);
      return origin in robots ? robots[origin] : { status: 404, body: '' };
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...overrides,
  };
  return {
    gate: createHostGate(deps),
    tick: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
    sleeps,
    robotsCalls,
  };
}

const url = (path: string, origin = A) => new URL(path, origin);

describe('hostOf', () => {
  it('is the lowercased host with any explicit port', () => {
    expect(hostOf(new URL('https://WWW.Example.GOV.au/x'))).toBe('www.example.gov.au');
    expect(hostOf(new URL('https://www.example.gov.au:8443/x'))).toBe('www.example.gov.au:8443');
  });
});

describe('admit', () => {
  it('fetches robots.txt once per origin and admits when it is absent', async () => {
    const h = harness();
    expect(await h.gate.admit(url('/news'))).toEqual({ kind: 'go' });
    expect(await h.gate.admit(url('/media'))).toEqual({ kind: 'go' });
    expect(h.robotsCalls).toEqual([A]);
    expect(h.gate.hosts()[hostOf(url('/'))]?.robots).toMatchObject({
      status: 'absent',
      fetchedAt: new Date(START).toISOString(),
    });
  });

  it('paces every request to one host, the robots fetch included', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    expect(h.sleeps).toEqual([DEFAULT_MIN_GAP_MS]);
    await h.gate.admit(url('/two'));
    expect(h.sleeps).toEqual([DEFAULT_MIN_GAP_MS, DEFAULT_MIN_GAP_MS]);
    h.tick(500);
    await h.gate.admit(url('/three'));
    expect(h.sleeps.at(-1)).toBe(DEFAULT_MIN_GAP_MS - 500);
    h.tick(5000);
    await h.gate.admit(url('/four'));
    expect(h.sleeps).toHaveLength(3);
    expect(h.gate.waited()).toEqual({ [hostOf(url('/'))]: 3 * DEFAULT_MIN_GAP_MS - 500 });
  });

  it('does not make one host wait for another', async () => {
    const h = harness();
    await h.gate.admit(url('/a', A));
    await h.gate.admit(url('/b', B));
    expect(h.sleeps).toEqual([DEFAULT_MIN_GAP_MS, DEFAULT_MIN_GAP_MS]);
    expect(h.robotsCalls).toEqual([A, B]);
  });

  it('honours a configured minimum gap', async () => {
    const h = harness({}, { minGapMs: 100 });
    await h.gate.admit(url('/one'));
    expect(h.sleeps).toEqual([100]);
  });

  it.each<[delay: string, gapMs: number]>([
    ['1', DEFAULT_MIN_GAP_MS],
    ['7', 7000],
    ['2.5', 2500],
    ['100', MAX_WAIT_MS],
  ])('uses Crawl-delay %s when larger than the gap, capped: %d ms', async (delay, gapMs) => {
    const h = harness({ [A]: { status: 200, body: `User-agent: *\nCrawl-delay: ${delay}` } });
    await h.gate.admit(url('/one'));
    expect(h.sleeps).toEqual([gapMs]);
  });

  it('refuses a path robots.txt disallows and names the class in its detail', async () => {
    const h = harness({
      [A]: { status: 200, body: 'User-agent: *\nDisallow: /search\nDisallow: /*.pdf$\nAllow: /search/open' },
    });
    const refused = await h.gate.admit(url('/search?q=ai'));
    expect(refused).toMatchObject({ kind: 'refused', cls: 'robots_disallowed' });
    if (refused.kind !== 'refused') throw new Error('expected refusal');
    expect(classifyFailure(refused.detail)).toEqual({
      cls: 'robots_disallowed',
      url: `${A}/search?q=ai`,
    });
    expect(await h.gate.admit(url('/files/a.pdf'))).toMatchObject({ cls: 'robots_disallowed' });
    expect(await h.gate.admit(url('/files/a.pdf?download=1'))).toEqual({ kind: 'go' });
    expect(await h.gate.admit(url('/search/open/item'))).toEqual({ kind: 'go' });
    expect(await h.gate.admit(url('/news'))).toEqual({ kind: 'go' });
    expect(h.robotsCalls).toEqual([A]);
  });

  it('a robots refusal costs no wait and does not trip the host', async () => {
    const h = harness({ [A]: { status: 200, body: 'User-agent: *\nDisallow: /private' } });
    await h.gate.admit(url('/public'));
    const before = h.sleeps.length;
    expect(await h.gate.admit(url('/private/x'))).toMatchObject({ cls: 'robots_disallowed' });
    expect(h.sleeps).toHaveLength(before);
    expect(await h.gate.admit(url('/public/2'))).toEqual({ kind: 'go' });
  });

  it('prefers the Policai group over the wildcard group', async () => {
    const h = harness({
      [A]: { status: 200, body: 'User-agent: *\nDisallow: /\n\nUser-agent: Policai\nDisallow: /nope' },
    });
    expect(await h.gate.admit(url('/news'))).toEqual({ kind: 'go' });
    expect(await h.gate.admit(url('/nope'))).toMatchObject({ cls: 'robots_disallowed' });
  });

  it.each([400, 401, 403, 404, 410, 451])('treats a %d robots.txt as allow-all', async (status) => {
    const h = harness({ [A]: { status, body: 'User-agent: *\nDisallow: /' } });
    expect(await h.gate.admit(url('/anything'))).toEqual({ kind: 'go' });
    expect(h.gate.hosts()[hostOf(url('/'))]?.robots?.status).toBe('absent');
  });

  it.each([500, 502, 503, 504])(
    'treats a %d robots.txt as host unavailable for the run and fails fast afterwards',
    async (status) => {
      const h = harness({ [A]: { status, body: '' } });
      const first = await h.gate.admit(url('/one'));
      expect(first).toMatchObject({ kind: 'refused', cls: 'host_unavailable' });
      if (first.kind !== 'refused') throw new Error('expected refusal');
      expect(classifyFailure(first.detail)).toEqual({ cls: 'host_unavailable', url: `${A}/one` });
      expect(await h.gate.admit(url('/two'))).toMatchObject({ cls: 'host_unavailable' });
      expect(h.robotsCalls).toEqual([A]);
      expect(await h.gate.admit(url('/b', B))).toEqual({ kind: 'go' });
      expect(h.gate.hosts()[hostOf(url('/'))]?.robots?.status).toBe('unreachable');
    },
  );

  it('treats an unreachable robots.txt as host unavailable for the run', async () => {
    const h = harness({ [A]: null });
    const first = await h.gate.admit(url('/one'));
    expect(first).toMatchObject({ kind: 'refused', cls: 'host_unavailable' });
    if (first.kind !== 'refused') throw new Error('expected refusal');
    expect(classifyFailure(first.detail)).toEqual({ cls: 'host_unavailable', url: `${A}/one` });
    expect(await h.gate.admit(url('/two'))).toMatchObject({ cls: 'host_unavailable' });
    expect(h.robotsCalls).toEqual([A]);
  });

  it('reuses cached robots for 24 h and refetches after', async () => {
    const host = hostOf(url('/'));
    const cached = (ageMs: number, status: RobotsRecord['status']): Record<string, HostRecord> => ({
      [host]: {
        seenAt: new Date(START - ageMs).toISOString(),
        robots: {
          fetchedAt: new Date(START - ageMs).toISOString(),
          status,
          allow: [],
          disallow: ['/cached-rule'],
          crawlDelaySec: null,
          sitemaps: [],
        },
        backoffUntil: null,
        backoffStatus: null,
        backoffCount: 0,
      },
    });
    const fresh = harness({ [A]: { status: 200, body: 'User-agent: *\nDisallow: /live-rule' } }, { hosts: cached(HOUR, 'parsed') });
    expect(await fresh.gate.admit(url('/cached-rule'))).toMatchObject({ cls: 'robots_disallowed' });
    expect(fresh.robotsCalls).toEqual([]);

    const stale = harness({ [A]: { status: 200, body: 'User-agent: *\nDisallow: /live-rule' } }, { hosts: cached(ROBOTS_TTL_MS + 1, 'parsed') });
    expect(await stale.gate.admit(url('/cached-rule'))).toEqual({ kind: 'go' });
    expect(await stale.gate.admit(url('/live-rule'))).toMatchObject({ cls: 'robots_disallowed' });
    expect(stale.robotsCalls).toEqual([A]);

    const unreachable = harness({}, { hosts: cached(HOUR, 'unreachable') });
    expect(await unreachable.gate.admit(url('/cached-rule'))).toEqual({ kind: 'go' });
    expect(unreachable.robotsCalls).toEqual([A]);
  });

  it('skips a host a merged decision marks refused, with no request and no wait', async () => {
    const h = harness({}, { refused: new Map([[hostOf(url('/')), 'finance-news']]) });
    expect(await h.gate.admit(url('/anything'))).toEqual({ kind: 'decided_block', sourceId: 'finance-news' });
    expect(h.robotsCalls).toEqual([]);
    expect(h.sleeps).toEqual([]);
  });

  it('refuses while a persisted backoff from an earlier run is still running', async () => {
    const host = hostOf(url('/'));
    const h = harness({}, {
      hosts: {
        [host]: {
          seenAt: new Date(START - HOUR).toISOString(),
          robots: null,
          backoffUntil: new Date(START + 2 * HOUR).toISOString(),
          backoffStatus: 429,
          backoffCount: 2,
        },
      },
    });
    const refused = await h.gate.admit(url('/x'));
    expect(refused).toMatchObject({ kind: 'refused', cls: 'rate_limited' });
    if (refused.kind !== 'refused') throw new Error('expected refusal');
    expect(classifyFailure(refused.detail)).toEqual({ cls: 'rate_limited', url: `${A}/x` });
    expect(h.robotsCalls).toEqual([]);
  });
});

describe('observe', () => {
  it('trips the host after one 403 and fails later requests fast as identity_refused', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    h.gate.observe(url('/one'), { status: 403 });
    const refused = await h.gate.admit(url('/two'));
    expect(refused).toMatchObject({ kind: 'refused', cls: 'identity_refused' });
    if (refused.kind !== 'refused') throw new Error('expected refusal');
    expect(classifyFailure(refused.detail)).toEqual({ cls: 'identity_refused', url: `${A}/two` });
    expect(await h.gate.admit(url('/b', B))).toEqual({ kind: 'go' });
    expect(h.gate.hosts()[hostOf(url('/'))]).toMatchObject({ backoffUntil: null, backoffStatus: null });
  });

  it.each([200, 204, 301, 302, 304, 400, 401, 404, 410, 500, 502])(
    'does not infer a refusal from a %d',
    async (status) => {
      const h = harness();
      await h.gate.admit(url('/one'));
      h.gate.observe(url('/one'), { status });
      expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
    },
  );

  it.each<[status: 429 | 503, cls: string]>([
    [429, 'rate_limited'],
    [503, 'host_unavailable'],
  ])('backs off for Retry-After seconds after a %d and classifies as %s', async (status, cls) => {
    const h = harness();
    await h.gate.admit(url('/one'));
    const observedAt = h.at();
    h.gate.observe(url('/one'), { status, retryAfter: '120' });
    const refused = await h.gate.admit(url('/two'));
    expect(refused).toMatchObject({ kind: 'refused', cls });
    if (refused.kind !== 'refused') throw new Error('expected refusal');
    expect(classifyFailure(refused.detail).cls).toBe(cls);
    expect(h.gate.hosts()[hostOf(url('/'))]).toMatchObject({
      backoffUntil: new Date(observedAt + 120_000).toISOString(),
      backoffStatus: status,
      backoffCount: 1,
    });
    h.tick(121_000);
    expect(await h.gate.admit(url('/three'))).toEqual({ kind: 'go' });
  });

  it('waits out a Retry-After shorter than the wait cap instead of refusing', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    h.gate.observe(url('/one'), { status: 429, retryAfter: '5' });
    expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
    expect(h.sleeps.at(-1)).toBe(5000);
  });

  it('reads an HTTP-date Retry-After', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    const until = new Date(h.at() + 90 * 60 * 1000);
    h.gate.observe(url('/one'), { status: 429, retryAfter: until.toUTCString() });
    expect(h.gate.hosts()[hostOf(url('/'))]?.backoffUntil).toBe(
      new Date(Math.floor(until.getTime() / 1000) * 1000).toISOString(),
    );
    expect(await h.gate.admit(url('/two'))).toMatchObject({ cls: 'rate_limited' });
  });

  it('clamps an excessive Retry-After to the 24 h cap', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    h.gate.observe(url('/one'), { status: 503, retryAfter: '999999999' });
    expect(h.gate.hosts()[hostOf(url('/'))]?.backoffUntil).toBe(new Date(h.at() + BACKOFF_CAP_MS).toISOString());
  });

  it.each(['', 'soon', '-5', '1.5', null, undefined])(
    'doubles from 1 h up to 24 h when Retry-After is %j, and a success resets it',
    async (retryAfter) => {
      const h = harness();
      const host = hostOf(url('/'));
      const expected = [1, 2, 4, 8, 16, 24, 24];
      for (const [index, hours] of expected.entries()) {
        h.tick(BACKOFF_CAP_MS);
        await h.gate.admit(url('/one'));
        h.gate.observe(url('/one'), { status: 429, retryAfter });
        expect(h.gate.hosts()[host]).toMatchObject({
          backoffUntil: new Date(h.at() + hours * HOUR).toISOString(),
          backoffCount: index + 1,
        });
      }
      h.tick(BACKOFF_CAP_MS);
      await h.gate.admit(url('/one'));
      h.gate.observe(url('/one'), { status: 200 });
      expect(h.gate.hosts()[host]).toMatchObject({ backoffUntil: null, backoffStatus: null, backoffCount: 0 });
      h.gate.observe(url('/one'), { status: 429, retryAfter });
      expect(h.gate.hosts()[host]?.backoffUntil).toBe(new Date(h.at() + HOUR).toISOString());
    },
  );
});

describe('hosts', () => {
  it('records when a host was last admitted and prunes hosts unseen for 30 days', async () => {
    const stale = hostOf(new URL('https://old.gov.au'));
    const recent = hostOf(new URL('https://recent.gov.au'));
    const record = (ageMs: number): HostRecord => ({
      seenAt: new Date(START - ageMs).toISOString(),
      robots: null,
      backoffUntil: null,
      backoffStatus: null,
      backoffCount: 0,
    });
    const h = harness({}, { hosts: { [stale]: record(HOST_RETENTION_MS + 1), [recent]: record(HOUR) } });
    await h.gate.admit(url('/x'));
    const hosts = h.gate.hosts();
    expect(Object.keys(hosts).sort()).toEqual([recent, hostOf(url('/'))].sort());
    expect(hosts[hostOf(url('/'))]?.seenAt).toBe(new Date(START).toISOString());
  });

  it('does not persist an oversized rule set or more than the sitemap cap', async () => {
    const rules = Array.from({ length: ROBOTS_RULES_CAP + 1 }, (_, i) => `Disallow: /r${i}`).join('\n');
    const sitemaps = Array.from({ length: ROBOTS_SITEMAPS_CAP + 5 }, (_, i) => `Sitemap: ${A}/s${i}.xml`).join('\n');
    const h = harness({
      [A]: { status: 200, body: `User-agent: *\n${rules}` },
      [B]: { status: 200, body: `User-agent: *\nDisallow: /x\n${sitemaps}` },
    });
    expect(await h.gate.admit(url('/r7'))).toMatchObject({ cls: 'robots_disallowed' });
    await h.gate.admit(url('/y', B));
    const hosts = h.gate.hosts();
    expect(hosts[hostOf(url('/'))]?.robots).toBeNull();
    expect(hosts[hostOf(url('/', B))]?.robots?.sitemaps).toHaveLength(ROBOTS_SITEMAPS_CAP);
  });

  it('returns copies, so mutation of the result does not change the gate', async () => {
    const h = harness();
    await h.gate.admit(url('/x'));
    const hosts = h.gate.hosts();
    delete hosts[hostOf(url('/'))];
    expect(h.gate.hosts()[hostOf(url('/'))]).toBeDefined();
  });
});
