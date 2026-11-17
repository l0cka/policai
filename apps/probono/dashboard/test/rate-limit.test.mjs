import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RATE_LIMITS, checkRateLimit, rateLimitRetryAfter } from '../lib/rate-limit.ts';

const CLOUDFLARE_CONTEXT = Symbol.for('__cloudflare-context__');

const config = (bucket, limit, windowSeconds = 10) => ({
  bucket,
  binding: 'RATE_LIMIT_TEST',
  limit,
  windowSeconds,
});

const requestFrom = (ip, url = 'https://a2j.policai.org/api/status', extra = {}) =>
  new Request(url, { headers: { 'cf-connecting-ip': ip, ...extra } });

describe('checkRateLimit without a Workers binding', () => {
  afterEach(() => mock.timers.reset());

  it('allows requests while the limit has not been reached', async () => {
    const request = requestFrom('203.0.113.1');

    assert.equal(await checkRateLimit(request, config('allow', 2)), null);
    assert.equal(await checkRateLimit(request, config('allow', 2)), null);
  });

  it('returns a 429 response with a retry header when the limit is exceeded', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01T00:00:00.000Z') });
    const request = requestFrom('203.0.113.2');

    await checkRateLimit(request, config('exceed', 1));
    const response = await checkRateLimit(request, config('exceed', 1));

    assert.equal(response?.status, 429);
    assert.equal(response?.headers.get('Retry-After'), '10');
    assert.deepEqual(await response?.json(), { error: 'Too many requests', success: false });
  });

  it('resets the counter after the window expires', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01T00:00:00.000Z') });
    const request = requestFrom('203.0.113.3');

    await checkRateLimit(request, config('reset', 1, 5));
    assert.equal((await checkRateLimit(request, config('reset', 1, 5)))?.status, 429);

    mock.timers.tick(5_001);

    assert.equal(await checkRateLimit(request, config('reset', 1, 5)), null);
  });

  it('ignores client-supplied forwarding headers when picking the client', async () => {
    const request = (spoofed) =>
      requestFrom('203.0.113.4', 'https://a2j.policai.org/mcp', {
        'x-forwarded-for': spoofed,
        'x-real-ip': spoofed,
      });

    assert.equal(await checkRateLimit(request('198.51.100.1'), config('spoof', 1, 60)), null);
    assert.equal((await checkRateLimit(request('198.51.100.2'), config('spoof', 1, 60)))?.status, 429);
  });

  it('counts each client and each bucket separately', async () => {
    assert.equal(await checkRateLimit(requestFrom('203.0.113.5'), config('separate-a', 1, 60)), null);
    assert.equal(await checkRateLimit(requestFrom('203.0.113.6'), config('separate-a', 1, 60)), null);
    assert.equal(await checkRateLimit(requestFrom('203.0.113.5'), config('separate-b', 1, 60)), null);
    assert.equal((await checkRateLimit(requestFrom('203.0.113.5'), config('separate-a', 1, 60)))?.status, 429);
  });

  it('reports the seconds to wait from request headers alone', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01T00:00:00.000Z') });
    const headers = new Headers({ 'cf-connecting-ip': '203.0.113.7' });

    assert.equal(await rateLimitRetryAfter(headers, config('headers', 1, 60)), null);
    mock.timers.tick(20_000);
    assert.equal(await rateLimitRetryAfter(headers, config('headers', 1, 60)), 40);
  });
});

describe('checkRateLimit on Workers', () => {
  afterEach(() => {
    delete globalThis[CLOUDFLARE_CONTEXT];
  });

  it('counts through the binding, keyed by bucket and client', async () => {
    const keys = [];
    let allow = true;
    globalThis[CLOUDFLARE_CONTEXT] = {
      env: {
        RATE_LIMIT_TEST: {
          limit: async ({ key }) => {
            keys.push(key);
            return { success: allow };
          },
        },
      },
    };

    assert.equal(await checkRateLimit(requestFrom('203.0.113.8'), config('worker', 1, 60)), null);
    allow = false;
    const limited = await checkRateLimit(requestFrom('203.0.113.8'), config('worker', 1, 60));

    assert.equal(limited?.status, 429);
    assert.equal(limited?.headers.get('Retry-After'), '60');
    assert.deepEqual(keys, ['worker:203.0.113.8', 'worker:203.0.113.8']);
  });
});

describe('RATE_LIMITS', () => {
  it('matches the ratelimits bindings in wrangler.jsonc', () => {
    const jsonc = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const wrangler = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, ''));
    const declared = Object.fromEntries(
      wrangler.ratelimits.map((b) => [b.name, { limit: b.simple.limit, windowSeconds: b.simple.period }]),
    );
    const expected = Object.fromEntries(
      Object.values(RATE_LIMITS).map((c) => [c.binding, { limit: c.limit, windowSeconds: c.windowSeconds }]),
    );

    assert.deepEqual(declared, expected);
    assert.equal(new Set(wrangler.ratelimits.map((b) => b.namespace_id)).size, wrangler.ratelimits.length);
  });
});

describe('rate-limited routes', () => {
  async function statuses(call, count) {
    const seen = [];
    for (let i = 0; i < count; i += 1) seen.push((await call()).status);
    return seen;
  }

  it('GET /api/first-contact answers 429 once a client is over the public API budget', async () => {
    const { GET } = await import('../app/api/first-contact/route.ts');
    const call = (ip) => GET(requestFrom(ip, 'https://a2j.policai.org/api/first-contact?state=NSW&problem=tenancy'));
    const { limit } = RATE_LIMITS.publicApi;

    const seen = await statuses(() => call('203.0.113.20'), limit + 1);

    assert.ok(seen.slice(0, limit).every((status) => status !== 429));
    assert.equal(seen[limit], 429);
    assert.notEqual((await call('203.0.113.21')).status, 429);
  });

  it('GET /api/status shares that budget and stops before the database', async () => {
    const { GET } = await import('../app/api/status/route.ts');
    const call = () => GET(requestFrom('203.0.113.22'));
    const { limit } = RATE_LIMITS.publicApi;

    const seen = await statuses(call, limit + 1);

    assert.ok(seen.slice(0, limit).every((status) => status === 503));
    assert.equal(seen[limit], 429);
  });

  it('POST /mcp answers 429 once a client is over the MCP budget', async () => {
    const { POST } = await import('../app/mcp/route.ts');
    const call = () =>
      POST(
        new Request('https://a2j.policai.org/mcp', {
          method: 'POST',
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
          headers: { 'cf-connecting-ip': '203.0.113.23' },
        }),
      );
    const { limit } = RATE_LIMITS.mcp;

    const seen = await statuses(call, limit + 1);

    assert.ok(seen.slice(0, limit).every((status) => status === 200));
    assert.equal(seen[limit], 429);
  });
});
