/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAgency } from '@/test/factories'

const { getAgencies, getCommonwealthAgencies } = vi.hoisted(() => ({
  getAgencies: vi.fn(),
  getCommonwealthAgencies: vi.fn(),
}))

vi.mock('@/lib/data-service', () => ({
  getAgencies,
  getCommonwealthAgencies,
}))

import { GET } from './route'

describe('/api/agencies', () => {
  beforeEach(() => {
    getAgencies.mockReset()
    getCommonwealthAgencies.mockReset()
  })

  it('returns commonwealth agencies when requested explicitly', async () => {
    const agencies = [buildAgency({ id: 'commonwealth-agency' })]
    getCommonwealthAgencies.mockResolvedValue(agencies)

    const response = await GET(new Request('https://example.com/api/agencies?commonwealth=true'))

    expect(getCommonwealthAgencies).toHaveBeenCalledTimes(1)
    expect(getAgencies).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      data: agencies,
      total: 1,
      success: true,
    })
  })

  it('forwards level and jurisdiction filters to the data service', async () => {
    const agencies = [buildAgency({ id: 'federal-agency' })]
    getAgencies.mockResolvedValue(agencies)

    const response = await GET(
      new Request('https://example.com/api/agencies?level=federal&jurisdiction=federal'),
    )

    expect(getAgencies).toHaveBeenCalledWith({
      level: 'federal',
      jurisdiction: 'federal',
    })
    await expect(response.json()).resolves.toEqual({
      data: agencies,
      total: 1,
      success: true,
    })
  })
})
