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

describe('/api/policies/[id]/markdown', () => {
  beforeEach(() => {
    getPolicyById.mockReset()
  })

  it('returns the record as Markdown with provenance', async () => {
    getPolicyById.mockResolvedValue(buildPolicy({ id: 'policy-123' }))

    const response = await GET(
      new Request('https://example.com/api/policies/policy-123/markdown'),
      { params: Promise.resolve({ id: 'policy-123' }) },
    )

    expect(getPolicyById).toHaveBeenCalledWith('policy-123')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="policy-123.md"',
    )
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    const body = await response.text()
    expect(body).toContain('# National AI Ethics Framework')
    expect(body).toContain('- Policai record: https://policai.org/policies/policy-123')
  })

  it('returns a JSON 404 for records that are not public', async () => {
    getPolicyById.mockResolvedValue(null)

    const response = await GET(
      new Request('https://example.com/api/policies/missing/markdown'),
      { params: Promise.resolve({ id: 'missing' }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Policy not found',
      success: false,
    })
  })
})
