/* @vitest-environment node */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { cloudflareEnv } = vi.hoisted(() => ({
  cloudflareEnv: { current: null as Record<string, unknown> | null },
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => {
    if (!cloudflareEnv.current) throw new Error('not on Workers')
    return { env: cloudflareEnv.current }
  },
}))

async function loadRateLimitModule() {
  vi.resetModules()
  return import('./rate-limit')
}

const config = (limit: number, windowSeconds = 10) => ({
  bucket: 'api',
  binding: 'RATE_LIMIT_TEST',
  limit,
  windowSeconds,
})

const requestFrom = (ip: string, url = 'https://example.com/api/policies', extra: Record<string, string> = {}) =>
  new Request(url, { headers: { 'cf-connecting-ip': ip, ...extra } })

describe('checkRateLimit without a Workers binding', () => {
  beforeEach(() => {
    cloudflareEnv.current = null
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests while the limit has not been reached', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = requestFrom('203.0.113.1')

    expect(await checkRateLimit(request, config(2))).toBeNull()
    expect(await checkRateLimit(request, config(2))).toBeNull()
  })

  it('returns a 429 response with a retry header when the limit is exceeded', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = requestFrom('203.0.113.2')

    await checkRateLimit(request, config(1))
    const response = await checkRateLimit(request, config(1))

    expect(response?.status).toBe(429)
    expect(response?.headers.get('Retry-After')).toBe('10')
    await expect(response?.json()).resolves.toEqual({
      error: 'Too many requests',
      success: false,
    })
  })

  it('resets the counter after the window expires', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = requestFrom('203.0.113.3')

    await checkRateLimit(request, config(1, 5))
    expect((await checkRateLimit(request, config(1, 5)))?.status).toBe(429)

    vi.advanceTimersByTime(5_001)

    expect(await checkRateLimit(request, config(1, 5))).toBeNull()
  })

  it('ignores client-supplied forwarding headers when picking the client', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = (spoofed: string) =>
      requestFrom('203.0.113.4', 'https://example.com/api/signal/reviews', {
        'x-forwarded-for': spoofed,
        'x-real-ip': spoofed,
      })

    expect(await checkRateLimit(request('198.51.100.1'), config(1, 60))).toBeNull()
    expect((await checkRateLimit(request('198.51.100.2'), config(1, 60)))?.status).toBe(429)
  })

  it('shares one budget across every path in a bucket', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = (id: string) => requestFrom('203.0.113.5', `https://example.com/api/signal/reviews/${id}`)

    expect(await checkRateLimit(request('review-1'), config(1, 60))).toBeNull()
    expect((await checkRateLimit(request('review-2'), config(1, 60)))?.status).toBe(429)
  })
})

describe('checkRateLimit on Workers', () => {
  afterEach(() => {
    cloudflareEnv.current = null
  })

  it('counts through the binding, keyed by bucket and client', async () => {
    const keys: string[] = []
    let allow = true
    cloudflareEnv.current = {
      RATE_LIMIT_TEST: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key)
          return { success: allow }
        },
      },
    }
    const { checkRateLimit } = await loadRateLimitModule()

    expect(await checkRateLimit(requestFrom('203.0.113.6'), config(1, 60))).toBeNull()
    allow = false
    const limited = await checkRateLimit(requestFrom('203.0.113.6'), config(1, 60))

    expect(limited?.status).toBe(429)
    expect(limited?.headers.get('Retry-After')).toBe('60')
    expect(keys).toEqual(['api:203.0.113.6', 'api:203.0.113.6'])
  })
})

describe('RATE_LIMITS', () => {
  it('matches the ratelimits bindings in wrangler.jsonc', async () => {
    const { RATE_LIMITS } = await loadRateLimitModule()
    const jsonc = readFileSync(path.join(process.cwd(), 'wrangler.jsonc'), 'utf8')
    const wrangler = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, '')) as {
      ratelimits: { name: string; namespace_id: string; simple: { limit: number; period: number } }[]
    }
    const declared = Object.fromEntries(
      wrangler.ratelimits.map((b) => [b.name, { limit: b.simple.limit, windowSeconds: b.simple.period }]),
    )
    const expected = Object.fromEntries(
      Object.values(RATE_LIMITS).map((c) => [c.binding, { limit: c.limit, windowSeconds: c.windowSeconds }]),
    )

    expect(declared).toEqual(expected)
    expect(new Set(wrangler.ratelimits.map((b) => b.namespace_id)).size).toBe(wrangler.ratelimits.length)
  })
})
