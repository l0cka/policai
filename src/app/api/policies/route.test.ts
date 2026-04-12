/* @vitest-environment node */

import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPolicy } from '@/test/factories'

const {
  summarizePolicy,
  getPolicies,
  createPolicy,
  verifyAuth,
  checkRateLimit,
  MockDuplicatePolicyError,
} = vi.hoisted(() => ({
  summarizePolicy: vi.fn(),
  getPolicies: vi.fn(),
  createPolicy: vi.fn(),
  verifyAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  MockDuplicatePolicyError: class MockDuplicatePolicyError extends Error {
    constructor(id: string) {
      super(`Policy already exists: ${id}`)
      this.name = 'DuplicatePolicyError'
    }
  },
}))

vi.mock('@/lib/claude', () => ({
  summarizePolicy,
}))

vi.mock('@/lib/data-service', () => ({
  DuplicatePolicyError: MockDuplicatePolicyError,
  getPolicies,
  createPolicy,
}))

vi.mock('@/lib/auth', () => ({
  verifyAuth,
  unauthorizedResponse: () =>
    NextResponse.json(
      { error: 'Unauthorized - Admin authentication required', success: false },
      { status: 401 },
    ),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
}))

import { GET, POST } from './route'

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY

describe('/api/policies', () => {
  beforeEach(() => {
    summarizePolicy.mockReset()
    getPolicies.mockReset()
    createPolicy.mockReset()
    verifyAuth.mockReset()
    checkRateLimit.mockReset()
    delete process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalOpenRouterKey
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

  it('requires admin auth for POST requests', async () => {
    verifyAuth.mockResolvedValue(null)

    const response = await POST(
      new Request('https://example.com/api/policies', {
        method: 'POST',
        body: JSON.stringify({ title: 'Unauthorised policy' }),
      }),
    )

    expect(response.status).toBe(401)
    expect(createPolicy).not.toHaveBeenCalled()
  })

  it('validates required POST fields', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin' })

    const response = await POST(
      new Request('https://example.com/api/policies', {
        method: 'POST',
        body: JSON.stringify({ title: 'Incomplete policy' }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Title, jurisdiction, type, and status are required',
      success: false,
    })
  })

  it('creates a policy and fills description from the generated summary when requested', async () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-key'
    verifyAuth.mockResolvedValue({ id: 'admin' })
    summarizePolicy.mockResolvedValue({
      summary: 'Generated AI summary',
    })
    createPolicy.mockImplementation(async (policy) => policy)

    const response = await POST(
      new Request('https://example.com/api/policies', {
        method: 'POST',
        body: JSON.stringify({
          title: 'National AI Governance Standard',
          jurisdiction: 'federal',
          type: 'standard',
          status: 'active',
          content: 'The full policy body',
          agencies: ['Department of Industry'],
          tags: ['governance'],
        }),
      }),
    )

    expect(summarizePolicy).toHaveBeenCalledWith(
      'National AI Governance Standard',
      'The full policy body',
    )
    expect(createPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'national-ai-governance-standard',
        title: 'National AI Governance Standard',
        description: 'Generated AI summary',
        aiSummary: 'Generated AI summary',
        jurisdiction: 'federal',
        type: 'standard',
        status: 'active',
        agencies: ['Department of Industry'],
        tags: ['governance'],
      }),
    )
    expect(response.status).toBe(200)
  })

  it('maps duplicate policy errors to a 409 response', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin' })
    createPolicy.mockRejectedValue(new MockDuplicatePolicyError('duplicate-policy'))

    const response = await POST(
      new Request('https://example.com/api/policies', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Duplicate policy',
          jurisdiction: 'federal',
          type: 'framework',
          status: 'active',
        }),
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'A policy with this title already exists',
      success: false,
    })
  })
})
