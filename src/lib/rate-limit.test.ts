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
        'x-forwarded-for': '203.0.113.1',
      },
    })

    expect(checkRateLimit(request, { limit: 2, windowSeconds: 10 })).toBeNull()
    expect(checkRateLimit(request, { limit: 2, windowSeconds: 10 })).toBeNull()
  })

  it('returns a 429 response with a retry header when the limit is exceeded', async () => {
    const { checkRateLimit } = await loadRateLimitModule()
    const request = new Request('https://example.com/api/policies', {
      headers: {
        'x-real-ip': '203.0.113.2',
      },
    })

    checkRateLimit(request, { limit: 1, windowSeconds: 10 })
    const response = checkRateLimit(request, { limit: 1, windowSeconds: 10 })

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
        'x-forwarded-for': '203.0.113.3',
      },
    })

    checkRateLimit(request, { limit: 1, windowSeconds: 5 })
    expect(checkRateLimit(request, { limit: 1, windowSeconds: 5 })?.status).toBe(429)

    vi.advanceTimersByTime(5_001)

    expect(checkRateLimit(request, { limit: 1, windowSeconds: 5 })).toBeNull()
  })
})
