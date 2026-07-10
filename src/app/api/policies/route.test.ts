/* @vitest-environment node */

import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPolicy } from '@/test/factories'

const { getPolicies, checkRateLimit } = vi.hoisted(() => ({
  getPolicies: vi.fn(),
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/data-service', () => ({
  getPolicies,
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
}))

import { GET } from './route'

describe('/api/policies', () => {
  beforeEach(() => {
    getPolicies.mockReset()
    checkRateLimit.mockReset()
  })

  it('returns filtered policies for GET requests', async () => {
    const policies = [buildPolicy({ id: 'policy-a' }), buildPolicy({ id: 'policy-b', jurisdiction: 'nsw' })]
    checkRateLimit.mockReturnValue(null)
    getPolicies.mockResolvedValue(policies)

    const response = await GET(
      new Request(
        'https://example.com/api/policies?jurisdiction=federal&type=framework&status=active&search=ethics',
      ),
    )

    expect(getPolicies).toHaveBeenCalledWith({
      jurisdiction: 'federal',
      type: 'framework',
      status: 'active',
      search: 'ethics',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: policies,
      total: 2,
      success: true,
    })
  })

  it('short-circuits GET requests that exceed the rate limit', async () => {
    checkRateLimit.mockReturnValue(
      NextResponse.json({ error: 'Too many requests', success: false }, { status: 429 }),
    )

    const response = await GET(new Request('https://example.com/api/policies'))

    expect(response.status).toBe(429)
    expect(getPolicies).not.toHaveBeenCalled()
  })

  it('refuses to expose trashed policies', async () => {
    checkRateLimit.mockReturnValue(null)

    const response = await GET(
      new Request('https://example.com/api/policies?status=trashed'),
    )

    expect(response.status).toBe(404)
    expect(getPolicies).not.toHaveBeenCalled()
  })
})
