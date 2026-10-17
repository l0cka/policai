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
  type Transport,
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
      url: `${A}/search`,
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
    'admits after a %d robots.txt, records it unreachable and fetches it once per run',
    async (status) => {
      const h = harness({ [A]: { status, body: '' } });
      expect(await h.gate.admit(url('/one'))).toEqual({ kind: 'go' });
      expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
      expect(h.robotsCalls).toEqual([A]);
      expect(h.gate.hosts()[hostOf(url('/'))]?.robots).toMatchObject({ status: 'unreachable', disallow: [] });
    },
  );

  it.each<[label: string, response: { status: number; body: string } | null]>([
    ['a connection reset, stall, oversize body, redirect loop or https-to-http redirect', null],
    ['a challenge page served as robots.txt', { status: 200, body: '<html><script>window.awsWafIntegration=1</script>Checking your browser before accessing</html>' }],
    ['a binary body served as robots.txt', { status: 200, body: '%PDF-1.7 binary' }],
  ])('admits after %s, never trips the host and fetches robots.txt once per run', async (_label, response) => {
    const h = harness({ [A]: response });
    expect(await h.gate.admit(url('/one'))).toEqual({ kind: 'go' });
    expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
    expect(await h.gate.admit(url('/b', B))).toEqual({ kind: 'go' });
    expect(h.robotsCalls).toEqual([A, B]);
    expect(h.gate.hosts()[hostOf(url('/'))]?.robots?.status).toBe(response === null ? 'unreachable' : 'parsed');
  });

  it('keeps the last parsed rules as the cached copy when the refetch is unreachable, and refetches next run', async () => {
    const host = hostOf(url('/'));
    const cached: Record<string, HostRecord> = {
      [host]: {
        seenAt: new Date(START - ROBOTS_TTL_MS - 1).toISOString(),
        robots: {
          fetchedAt: new Date(START - ROBOTS_TTL_MS - 1).toISOString(),
          status: 'parsed',
          allow: [],
          disallow: ['/private'],
          crawlDelaySec: 3,
          sitemaps: [],
        },
        backoffUntil: null,
        backoffStatus: null,
        backoffCount: 0,
      },
    };
    const h = harness({ [A]: null }, { hosts: cached });
    expect(await h.gate.admit(url('/private/x'))).toMatchObject({ kind: 'refused', cls: 'robots_disallowed' });
    expect(await h.gate.admit(url('/public'))).toEqual({ kind: 'go' });
    expect(h.robotsCalls).toEqual([A]);
    expect(h.gate.hosts()[host]?.robots).toMatchObject({
      status: 'unreachable',
      disallow: ['/private'],
      crawlDelaySec: 3,
      fetchedAt: new Date(h.at()).toISOString(),
    });
    const next = harness({ [A]: { status: 200, body: 'User-agent: *\nDisallow: /other' } }, { hosts: h.gate.hosts() });
    expect(await next.gate.admit(url('/private/x'))).toEqual({ kind: 'go' });
    expect(next.robotsCalls).toEqual([A]);
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
  it('trips the host after one browser 403 and fails later requests fast as identity_refused', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    h.gate.observe(url('/one'), { status: 403, transport: 'browser' });
    const refused = await h.gate.admit(url('/two'));
    expect(refused).toMatchObject({ kind: 'refused', cls: 'identity_refused' });
    if (refused.kind !== 'refused') throw new Error('expected refusal');
    expect(classifyFailure(refused.detail)).toEqual({ cls: 'identity_refused', url: `${A}/two` });
    expect(await h.gate.admit(url('/b', B))).toEqual({ kind: 'go' });
    expect(h.gate.hosts()[hostOf(url('/'))]).toMatchObject({ backoffUntil: null, backoffStatus: null });
  });

  it.each([200, 204, 301, 302, 304, 400, 401, 404, 410, 500, 502, 503])(
    'does not infer a refusal from a %d',
    async (status) => {
      const h = harness();
      await h.gate.admit(url('/one'));
      h.gate.observe(url('/one'), { status, transport: 'browser' });
      expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
    },
  );

  it.each<Transport>(['http', 'firecrawl'])(
    'leaves the host open after a 403 over %s, so the browser fallback can still run',
    async (transport) => {
      const h = harness();
      await h.gate.admit(url('/one'));
      h.gate.observe(url('/one'), { status: 403, transport });
      expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
    },
  );

  it('does not back off after a 503 without Retry-After', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    h.gate.observe(url('/one'), { status: 503, retryAfter: null, transport: 'http' });
    expect(h.gate.hosts()[hostOf(url('/'))]).toMatchObject({ backoffUntil: null, backoffCount: 0 });
    expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
  });

  it.each<[status: 429 | 503, cls: string]>([
    [429, 'rate_limited'],
    [503, 'host_unavailable'],
  ])('backs off for Retry-After seconds after a %d and classifies as %s', async (status, cls) => {
    const h = harness();
    await h.gate.admit(url('/one'));
    const observedAt = h.at();
    h.gate.observe(url('/one'), { status, retryAfter: '120', transport: 'http' });
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
    h.gate.observe(url('/one'), { status: 429, retryAfter: '5', transport: 'http' });
    expect(await h.gate.admit(url('/two'))).toEqual({ kind: 'go' });
    expect(h.sleeps.at(-1)).toBe(5000);
  });

  it('reads an HTTP-date Retry-After', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    const until = new Date(h.at() + 90 * 60 * 1000);
    h.gate.observe(url('/one'), { status: 429, retryAfter: until.toUTCString(), transport: 'http' });
    expect(h.gate.hosts()[hostOf(url('/'))]?.backoffUntil).toBe(
      new Date(Math.floor(until.getTime() / 1000) * 1000).toISOString(),
    );
    expect(await h.gate.admit(url('/two'))).toMatchObject({ cls: 'rate_limited' });
  });

  it('clamps an excessive Retry-After to the 24 h cap', async () => {
    const h = harness();
    await h.gate.admit(url('/one'));
    h.gate.observe(url('/one'), { status: 503, retryAfter: '999999999', transport: 'http' });
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
        h.gate.observe(url('/one'), { status: 429, retryAfter, transport: 'http' });
        expect(h.gate.hosts()[host]).toMatchObject({
          backoffUntil: new Date(h.at() + hours * HOUR).toISOString(),
          backoffCount: index + 1,
        });
      }
      h.tick(BACKOFF_CAP_MS);
      await h.gate.admit(url('/one'));
      h.gate.observe(url('/one'), { status: 200, transport: 'http' });
      expect(h.gate.hosts()[host]).toMatchObject({ backoffUntil: null, backoffStatus: null, backoffCount: 0 });
      h.gate.observe(url('/one'), { status: 429, retryAfter, transport: 'http' });
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

describe('state size', () => {
  it('keeps a 67-host state with Drupal-sized robots under 160 KiB when pretty-printed', async () => {
    const rules = Array.from({ length: 60 }, (_, i) => `Disallow: /core/path-number-${i}/`).join('\n');
    const robots: Robots = {};
    const origins = Array.from({ length: 67 }, (_, i) => `https://www.agency-${i}.gov.au`);
    for (const origin of origins) {
      robots[origin] = { status: 200, body: `User-agent: *\n${rules}\nSitemap: ${origin}/sitemap.xml` };
    }
    const h = harness(robots);
    for (const origin of origins) await h.gate.admit(url('/news', origin));
    const serialized = JSON.stringify(h.gate.hosts(), null, 2);
    const bytes = Buffer.byteLength(serialized);
    const lines = serialized.split('\n').length;
    expect(bytes).toBeLessThan(160 * 1024);
    expect(lines).toBeLessThan(67 * 80);
    console.info(`host state: ${bytes} bytes, ${lines} lines for 67 hosts x 60 rules`);
  });
});
