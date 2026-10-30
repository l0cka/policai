/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadRateLimitModule() {
  vi.resetModules()
  return import('./rate-limit')
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests while the limit has not been reached', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = new Request('https://example.com/api/policies', {
      headers: {
        'cf-connecting-ip': '203.0.113.1',
      },
    })

    expect(checkRateLimit(request, { bucket: 'api', limit: 2, windowSeconds: 10 })).toBeNull()
    expect(checkRateLimit(request, { bucket: 'api', limit: 2, windowSeconds: 10 })).toBeNull()
  })

  it('returns a 429 response with a retry header when the limit is exceeded', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = new Request('https://example.com/api/policies', {
      headers: {
        'cf-connecting-ip': '203.0.113.2',
      },
    })

    checkRateLimit(request, { bucket: 'api', limit: 1, windowSeconds: 10 })
    const response = checkRateLimit(request, { bucket: 'api', limit: 1, windowSeconds: 10 })

    expect(response?.status).toBe(429)
    expect(response?.headers.get('Retry-After')).toBe('10')
    await expect(response?.json()).resolves.toEqual({
      error: 'Too many requests',
      success: false,
    })
  })

  it('resets the counter after the window expires', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = new Request('https://example.com/api/policies', {
      headers: {
        'cf-connecting-ip': '203.0.113.3',
      },
    })

    checkRateLimit(request, { bucket: 'api', limit: 1, windowSeconds: 5 })
    expect(checkRateLimit(request, { bucket: 'api', limit: 1, windowSeconds: 5 })?.status).toBe(429)

    vi.advanceTimersByTime(5_001)

    expect(checkRateLimit(request, { bucket: 'api', limit: 1, windowSeconds: 5 })).toBeNull()
  })

  it('ignores client-supplied forwarding headers when picking the client', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const config = { bucket: 'signal', limit: 1, windowSeconds: 60 }
    const request = (spoofed: string) =>
      new Request('https://example.com/api/signal/reviews', {
        headers: {
          'cf-connecting-ip': '203.0.113.4',
          'x-forwarded-for': spoofed,
          'x-real-ip': spoofed,
        },
      })

    expect(checkRateLimit(request('198.51.100.1'), config)).toBeNull()
    expect(checkRateLimit(request('198.51.100.2'), config)?.status).toBe(429)
  })

  it('shares one budget across every path in a bucket', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const config = { bucket: 'signal-review', limit: 1, windowSeconds: 60 }
    const request = (id: string) =>
      new Request(`https://example.com/api/signal/reviews/${id}`, {
        headers: { 'cf-connecting-ip': '203.0.113.5' },
      })

    expect(checkRateLimit(request('review-1'), config)).toBeNull()
    expect(checkRateLimit(request('review-2'), config)?.status).toBe(429)
  })
})
