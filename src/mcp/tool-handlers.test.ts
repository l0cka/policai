/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  approveStagedSource,
  publishStagedSource,
  recordManualSourceReview,
  rejectStagedSource,
  stageSourceUrl,
} = vi.hoisted(() => ({
  approveStagedSource: vi.fn(),
  stageSourceUrl: vi.fn(),
  publishStagedSource: vi.fn(),
  recordManualSourceReview: vi.fn(),
  rejectStagedSource: vi.fn(),
}))

vi.mock('@/lib/source-ingest', () => ({
  analyseSourceUrl: vi.fn(),
  auditMcpTool: vi.fn(),
  checkCoverage: vi.fn(),
  normalizeReviewStatus: vi.fn((status?: string) => status),
  approveStagedSource,
  stageSourceUrl,
  publishStagedSource,
  recordManualSourceReview,
  rejectStagedSource,
}))

vi.mock('@/lib/data-service', () => ({
  getSourceReviews: vi.fn(),
}))

import {
  handleApproveStagedSource,
  handlePublishStagedSource,
  handleRecordManualSourceReview,
  handleRejectStagedSource,
  handleStageSourceUrl,
} from './tool-handlers'

const originalToken = process.env.POLICAI_MCP_ADMIN_TOKEN

describe('MCP tool handlers', () => {
  beforeEach(() => {
    process.env.POLICAI_MCP_ADMIN_TOKEN = 'secret-token'
    stageSourceUrl.mockReset()
    approveStagedSource.mockReset()
    publishStagedSource.mockReset()
    recordManualSourceReview.mockReset()
    rejectStagedSource.mockReset()
  })

  afterEach(() => {
    process.env.POLICAI_MCP_ADMIN_TOKEN = originalToken
  })

  it('rejects mutating tools when the admin token is missing or invalid', async () => {
    await expect(
      handleStageSourceUrl({
        url: 'https://example.gov.au/source',
        entryKind: 'policy',
      }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    await expect(
      handleApproveStagedSource({ id: 'source-review-1', adminToken: 'wrong' }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    await expect(
      handlePublishStagedSource({ id: 'source-review-1', adminToken: 'wrong' }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    await expect(
      handleRejectStagedSource({ id: 'source-review-1', adminToken: 'wrong' }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    await expect(
      handleRecordManualSourceReview({
        sourceId: 'dta-media',
        status: 'checked',
        adminToken: 'wrong',
      }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    expect(stageSourceUrl).not.toHaveBeenCalled()
    expect(approveStagedSource).not.toHaveBeenCalled()
    expect(publishStagedSource).not.toHaveBeenCalled()
    expect(rejectStagedSource).not.toHaveBeenCalled()
    expect(recordManualSourceReview).not.toHaveBeenCalled()
  })

  it('forwards the official replacement URL during approval', async () => {
    approveStagedSource.mockResolvedValue({ id: 'source-review-1' })

    await handleApproveStagedSource({
      id: 'source-review-1',
      reviewer: 'Jane Reviewer',
      officialSourceUrl: 'https://example.gov.au/official-policy',
      adminToken: 'secret-token',
    })

    expect(approveStagedSource).toHaveBeenCalledWith({
      id: 'source-review-1',
      actor: 'Jane Reviewer',
      proposedRecord: undefined,
      expectedTargetRevisionHash: undefined,
      officialSourceUrl: 'https://example.gov.au/official-policy',
      approvalNotes: undefined,
      manualExtraction: undefined,
      reviewedDate: undefined,
    })
  })

  it('forwards controlled OCR evidence during approval', async () => {
    approveStagedSource.mockResolvedValue({ id: 'source-review-1' })
    const manualExtraction = {
      method: 'ocr' as const,
      title: 'Official image-only policy',
      text: 'Reviewed OCR text from the official image-only policy.',
      notes: 'Compared against every source page.',
    }

    await handleApproveStagedSource({
      id: 'source-review-1',
      reviewer: 'Jane Reviewer',
      proposedRecord: { id: 'policy-1' },
      manualExtraction,
      adminToken: 'secret-token',
    })

    expect(approveStagedSource).toHaveBeenCalledWith(
      expect.objectContaining({ manualExtraction }),
    )
  })

  it('forwards explicit reviewed date evidence during approval', async () => {
    approveStagedSource.mockResolvedValue({ id: 'source-review-1' })
    const reviewedDate = {
      date: '2026-07-01',
      precision: 'day' as const,
      notes: 'Confirmed the effective date in the official instrument.',
    }

    await handleApproveStagedSource({
      id: 'source-review-1',
      reviewer: 'Jane Reviewer',
      reviewedDate,
      adminToken: 'secret-token',
    })

    expect(approveStagedSource).toHaveBeenCalledWith(
      expect.objectContaining({ reviewedDate }),
    )
  })

  it('forwards the expected target revision during a rebase', async () => {
    approveStagedSource.mockResolvedValue({ id: 'source-review-1' })
    const expectedTargetRevisionHash = 'a'.repeat(64)

    await handleApproveStagedSource({
      id: 'source-review-1',
      reviewer: 'Jane Reviewer',
      proposedRecord: { id: 'policy-1' },
      expectedTargetRevisionHash,
      adminToken: 'secret-token',
    })

    expect(approveStagedSource).toHaveBeenCalledWith(
      expect.objectContaining({ expectedTargetRevisionHash }),
    )
  })

  it('rejects approvals without a human reviewer identity', async () => {
    await expect(
      handleApproveStagedSource({
        id: 'source-review-1',
        reviewer: '   ',
        adminToken: 'secret-token',
      }),
    ).rejects.toThrow('human reviewer identity')
    expect(approveStagedSource).not.toHaveBeenCalled()
  })

  it('attributes manual source checks to the human reviewer', async () => {
    recordManualSourceReview.mockResolvedValue({ sourceId: 'dta-media' })

    await handleRecordManualSourceReview({
      sourceId: 'dta-media',
      status: 'checked',
      reviewer: 'Jane Reviewer',
      notes: 'Checked in a browser.',
      adminToken: 'secret-token',
    })

    expect(recordManualSourceReview).toHaveBeenCalledWith({
      sourceId: 'dta-media',
      status: 'checked',
      actor: 'Jane Reviewer',
      notes: 'Checked in a browser.',
    })
  })

  it('passes browser inspection evidence through to the manual review record', async () => {
    recordManualSourceReview.mockResolvedValue({ sourceId: 'dta-media' })

    await handleRecordManualSourceReview({
      sourceId: 'dta-media',
      status: 'checked',
      reviewer: 'Jane Reviewer',
      notes: 'Reviewed the full listing and checked every current entry.',
      evidence: {
        title: 'Latest news',
        publisher: 'Digital Transformation Agency',
        finalUrl: 'https://www.dta.gov.au/news-and-blogs/latest',
      },
      adminToken: 'secret-token',
    })

    expect(recordManualSourceReview).toHaveBeenCalledWith({
      sourceId: 'dta-media',
      status: 'checked',
      actor: 'Jane Reviewer',
      notes: 'Reviewed the full listing and checked every current entry.',
      evidence: {
        title: 'Latest news',
        publisher: 'Digital Transformation Agency',
        finalUrl: 'https://www.dta.gov.au/news-and-blogs/latest',
      },
    })
  })

  it('rejects manual source checks without a human reviewer identity', async () => {
    await expect(
      handleRecordManualSourceReview({
        sourceId: 'dta-media',
        status: 'checked',
        reviewer: '   ',
        adminToken: 'secret-token',
      }),
    ).rejects.toThrow('human reviewer identity')

    expect(recordManualSourceReview).not.toHaveBeenCalled()
  })
})
