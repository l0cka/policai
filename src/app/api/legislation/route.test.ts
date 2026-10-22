/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPolicy } from '@/test/factories'

const { getPolicies } = vi.hoisted(() => ({
  getPolicies: vi.fn(),
}))

vi.mock('@/lib/data-service', () => ({
  getPolicies,
}))

import { GET } from './route'

const source = { url: 'https://www.aph.gov.au/bill' }
const bill = buildPolicy({
  id: 'bill',
  type: 'legislation',
  legislative: {
    kind: 'bill',
    ref: { register: 'aph', billId: 'r7553' },
    origin: 'government',
    events: [{ date: '2026-10-15', precision: 'day', event: { kind: 'introduced', chamber: 'lower' }, source }],
  },
})

describe('/api/legislation', () => {
  beforeEach(() => {
    getPolicies.mockReset()
    getPolicies.mockResolvedValue([bill, buildPolicy({ id: 'guideline' })])
  })

  it('returns only legislative records, each with its derived stage', async () => {
    const response = await GET(new Request('https://example.com/api/legislation?jurisdiction=federal'))

    expect(getPolicies).toHaveBeenCalledWith({ jurisdiction: 'federal' })
    const body = await response.json()
    expect(body.total).toBe(1)
    expect(body.data.map((record: { id: string; stage: string }) => [record.id, record.stage])).toEqual([
      ['bill', 'before_parliament'],
    ])
  })

  it('filters by stage and rejects an unknown one', async () => {
    const inForce = await GET(new Request('https://example.com/api/legislation?stage=in_force'))
    await expect(inForce.json()).resolves.toMatchObject({ data: [], total: 0 })

    const invalid = await GET(new Request('https://example.com/api/legislation?stage=assented'))
    expect(invalid.status).toBe(400)
  })
})
