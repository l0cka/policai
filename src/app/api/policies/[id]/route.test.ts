/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPolicy } from '@/test/factories'

const { getPolicyById } = vi.hoisted(() => ({
  getPolicyById: vi.fn(),
}))

vi.mock('@/lib/data-service', () => ({
  getPolicyById,
}))

import { GET } from './route'

describe('/api/policies/[id]', () => {
  beforeEach(() => {
    getPolicyById.mockReset()
  })

  it('returns the requested policy when it exists', async () => {
    const policy = buildPolicy({ id: 'policy-123' })
    getPolicyById.mockResolvedValue(policy)

    const response = await GET(new Request('https://example.com/api/policies/policy-123'), {
      params: Promise.resolve({ id: 'policy-123' }),
    })

    expect(getPolicyById).toHaveBeenCalledWith('policy-123')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: policy,
      success: true,
    })
  })

  it('returns 404 when the requested policy does not exist', async () => {
    getPolicyById.mockResolvedValue(null)

    const response = await GET(new Request('https://example.com/api/policies/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Policy not found',
      success: false,
    })
  })
})
