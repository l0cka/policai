/* @vitest-environment node */

import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPolicy } from '@/test/factories'

const {
  verifyAuth,
  getSourceReviews,
  createSourceReview,
  updateSourceReview,
  deleteSourceReview,
} = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  getSourceReviews: vi.fn(),
  createSourceReview: vi.fn(),
  updateSourceReview: vi.fn(),
  deleteSourceReview: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  verifyAuth,
  unauthorizedResponse: () =>
    NextResponse.json(
      { error: 'Unauthorized - Admin authentication required', success: false },
      { status: 401 },
    ),
}))

vi.mock('@/lib/data-service', () => ({
  createSourceReview,
  deleteSourceReview,
  getSourceReviews,
  updateSourceReview,
}))

import { GET, POST, PUT } from './route'

function buildSourceReview() {
  return {
    id: 'source-review-1',
    sourceUrl: 'https://example.gov.au/source',
    title: 'Source title',
    entryKind: 'policy',
    status: 'pending_review',
    discoveredAt: '2026-05-01T00:00:00.000Z',
    createdBy: 'admin',
    analysis: {
      isRelevant: true,
      relevanceScore: 0.9,
      suggestedType: 'guideline',
      suggestedJurisdiction: 'federal',
      summary: 'Relevant source.',
      tags: ['ai'],
      agencies: ['Agency'],
    },
    proposedRecord: buildPolicy({ id: 'source-title' }),
    updatedAt: '2026-05-01T00:00:00.000Z',
  }
}

describe('/api/admin/pending', () => {
  beforeEach(() => {
    verifyAuth.mockReset()
    getSourceReviews.mockReset()
    createSourceReview.mockReset()
    updateSourceReview.mockReset()
    deleteSourceReview.mockReset()
  })

  it('returns source reviews in the existing pending-item response shape', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin' })
    getSourceReviews.mockResolvedValue([buildSourceReview()])

    const response = await GET(new Request('https://example.com/api/admin/pending'))

    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 'source-review-1',
          source: 'https://example.gov.au/source',
          aiAnalysis: expect.objectContaining({ summary: 'Relevant source.' }),
        }),
      ],
      total: 1,
      success: true,
    })
  })

  it('creates source reviews from analysed URL payloads', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin', email: 'admin@example.com' })
    createSourceReview.mockImplementation(async (review) => review)

    const response = await POST(
      new Request('https://example.com/api/admin/pending', {
        method: 'POST',
        body: JSON.stringify({
          url: 'https://example.gov.au/source',
          title: 'Source title',
          analysis: {
            isRelevant: true,
            relevanceScore: 0.9,
            policyType: 'guideline',
            jurisdiction: 'federal',
            summary: 'Relevant source.',
            tags: ['ai'],
            agencies: ['Agency'],
          },
        }),
      }),
    )

    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.gov.au/source',
        title: 'Source title',
        createdBy: 'admin@example.com',
      }),
    )
    expect(response.status).toBe(200)
  })

  it('updates source review status for existing admin approval flow', async () => {
    verifyAuth.mockResolvedValue({ id: 'admin' })
    updateSourceReview.mockResolvedValue({ ...buildSourceReview(), status: 'approved' })

    const response = await PUT(
      new Request('https://example.com/api/admin/pending', {
        method: 'PUT',
        body: JSON.stringify({ id: 'source-review-1', status: 'approved' }),
      }),
    )

    expect(updateSourceReview).toHaveBeenCalledWith('source-review-1', { status: 'approved' })
    expect(response.status).toBe(200)
  })
})
