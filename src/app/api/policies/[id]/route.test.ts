/* @vitest-environment node */

import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPolicy } from '@/test/factories'

const { getPolicyById, updatePolicy, deletePolicy, verifyAuth } = vi.hoisted(() => ({
  getPolicyById: vi.fn(),
  updatePolicy: vi.fn(),
  deletePolicy: vi.fn(),
  verifyAuth: vi.fn(),
}))

vi.mock('@/lib/data-service', () => ({
  getPolicyById,
  updatePolicy,
  deletePolicy,
}))

vi.mock('@/lib/auth', () => ({
  verifyAuth,
  unauthorizedResponse: () =>
    NextResponse.json(
      { error: 'Unauthorized - Admin authentication required', success: false },
      { status: 401 },
    ),
}))

import { DELETE, GET, PATCH } from './route'

describe('/api/policies/[id]', () => {
  beforeEach(() => {
    getPolicyById.mockReset()
    updatePolicy.mockReset()
    deletePolicy.mockReset()
    verifyAuth.mockReset()
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

  it('requires auth before applying PATCH updates', async () => {
    verifyAuth.mockResolvedValue(null)

    const response = await PATCH(
      new Request('https://example.com/api/policies/policy-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'amended' }),
      }),
      {
        params: Promise.resolve({ id: 'policy-123' }),
      },
    )

    expect(response.status).toBe(401)
    expect(updatePolicy).not.toHaveBeenCalled()
  })

  it('returns 404 when PATCH targets a missing policy', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin' })
    updatePolicy.mockResolvedValue(null)

    const response = await PATCH(
      new Request('https://example.com/api/policies/missing', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'amended' }),
      }),
      {
        params: Promise.resolve({ id: 'missing' }),
      },
    )

    expect(updatePolicy).toHaveBeenCalledWith('missing', { status: 'amended' })
    expect(response.status).toBe(404)
  })

  it('deletes a policy when authorised', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin' })
    deletePolicy.mockResolvedValue(true)

    const response = await DELETE(new Request('https://example.com/api/policies/policy-123'), {
      params: Promise.resolve({ id: 'policy-123' }),
    })

    expect(deletePolicy).toHaveBeenCalledWith('policy-123')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
    })
  })
})
