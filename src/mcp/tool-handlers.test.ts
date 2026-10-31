/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  decideSourceReview,
  proposeSourceDecision,
  recordManualSourceReview,
  rejectStagedSource,
  stageSourceCapture,
  stageSourceUrl,
  verifyRegisterRecord,
  getCourtRequirementsForReview,
  reviewCourtRequirement,
} = vi.hoisted(() => ({
  decideSourceReview: vi.fn(),
  proposeSourceDecision: vi.fn(),
  stageSourceUrl: vi.fn(),
  stageSourceCapture: vi.fn(),
  recordManualSourceReview: vi.fn(),
  rejectStagedSource: vi.fn(),
  verifyRegisterRecord: vi.fn(),
  getCourtRequirementsForReview: vi.fn(),
  reviewCourtRequirement: vi.fn(),
}))

vi.mock('@/lib/source-ingest', () => ({
  analyseSourceUrl: vi.fn(),
  auditMcpTool: vi.fn(),
  checkCoverage: vi.fn(),
  normalizeReviewStatus: vi.fn((status?: string) => status),
  decideSourceReview,
  proposeSourceDecision,
  stageSourceCapture,
  stageSourceUrl,
  recordManualSourceReview,
  rejectStagedSource,
  verifyRegisterRecord,
}))

vi.mock('@/lib/data-service', () => ({
  getSourceReviews: vi.fn(),
}))

vi.mock('@/lib/court-requirements', () => ({
  getCourtRequirementsForReview,
  reviewCourtRequirement,
}))

import {
  MAX_THEMES_PER_RECORD,
  MIN_RECORDS_PER_THEME,
  MIN_THEMES_PER_RECORD,
  THEMES,
} from '@/lib/themes'
import {
  handleListThemes,
  handleListCourtRequirementCandidates,
  handleRecordManualSourceReview,
  handleStageSourceCapture,
  handleReviewCourtRequirement,
  handleVerifyRegisterRecord,
} from './tool-handlers'

describe('MCP tool handlers', () => {
  beforeEach(() => {
    stageSourceUrl.mockReset()
    stageSourceCapture.mockReset()
    decideSourceReview.mockReset()
    proposeSourceDecision.mockReset()
    recordManualSourceReview.mockReset()
    rejectStagedSource.mockReset()
    verifyRegisterRecord.mockReset()
    getCourtRequirementsForReview.mockReset()
    reviewCourtRequirement.mockReset()
  })

  it('lists and reviews court requirement candidates', async () => {
    getCourtRequirementsForReview.mockResolvedValue({
      total: 1,
      requirements: [{ id: 'requirement-1' }],
    })
    reviewCourtRequirement.mockResolvedValue({ id: 'requirement-1' })

    await expect(
      handleListCourtRequirementCandidates({ status: 'pending_review' }),
    ).resolves.toEqual({
      total: 1,
      requirements: [{ id: 'requirement-1' }],
    })
    await handleReviewCourtRequirement({
      id: 'requirement-1',
      decision: 'verified',
      reviewer: ' Jane Reviewer ',
      notes: 'Compared against paragraph 4.',
    })

    expect(reviewCourtRequirement).toHaveBeenCalledWith({
      id: 'requirement-1',
      decision: 'verified',
      reviewer: 'Jane Reviewer',
      notes: 'Compared against paragraph 4.',
      revision: undefined,
    })
  })

  it('forwards reviewer-attributed browser captures without persisting the token', async () => {
    stageSourceCapture.mockResolvedValue({ id: 'source-review-1' })
    const capture = {
      pageTitle: 'Official policy',
      pageText: 'Official policy text with enough content for review.',
      references: ['https://example.gov.au/policy.pdf'],
      capturedAt: new Date().toISOString(),
      capturedBy: 'Jane Reviewer',
      notes: 'Captured from the official page in a controlled browser.',
      linkedDocuments: [{
        url: 'https://example.gov.au/policy.pdf',
        filePath: '/tmp/policy.pdf',
      }],
    }

    await handleStageSourceCapture({
      url: 'https://example.gov.au/policy',
      entryKind: 'policy',
      targetRecordId: 'policy-1',
      capture,
    })

    expect(stageSourceCapture).toHaveBeenCalledWith({
      url: 'https://example.gov.au/policy',
      entryKind: 'policy',
      targetRecordId: 'policy-1',
      proposedRecord: undefined,
      replaceTargetSource: undefined,
      notes: undefined,
      actor: 'local-mcp-admin',
      browserCapture: capture,
    })
  })

  it('attributes manual source checks to the human reviewer', async () => {
    recordManualSourceReview.mockResolvedValue({ sourceId: 'dta-media' })

    await handleRecordManualSourceReview({
      sourceId: 'dta-media',
      status: 'checked',
      reviewer: 'Jane Reviewer',
      notes: 'Checked in a browser.',
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
      }),
    ).rejects.toThrow('human reviewer identity')

    expect(recordManualSourceReview).not.toHaveBeenCalled()
  })

  it('verifies a named public register record for an allowlisted Signal reviewer', async () => {
    verifyRegisterRecord.mockResolvedValue({ id: 'policy-1' })

    await handleVerifyRegisterRecord({
      policyId: 'policy-1',
      reviewer: 'Daniel',
      notes: 'Checked against source.',
    })

    expect(verifyRegisterRecord).toHaveBeenCalledWith({
      policyId: 'policy-1',
      actor: 'Daniel',
      notes: 'Checked against source.',
    })
  })

  it('refuses verify_register_record for a non-allowlisted reviewer', async () => {
    await expect(
      handleVerifyRegisterRecord({
        policyId: 'policy-1',
        reviewer: 'Random Agent',
      }),
    ).rejects.toThrow('Signal reviewer must be one of: Daniel Alkurdi, Daniel')
    expect(verifyRegisterRecord).not.toHaveBeenCalled()
  })

  it('lists every theme key and label in table order with the theme rules', () => {
    const listing = handleListThemes()

    expect(listing.themes).toHaveLength(THEMES.length)
    expect(listing.themes[0]).toEqual({ key: 'generative-ai', label: 'Generative AI' })
    expect(listing.themes.map(({ key }) => key)).toEqual(THEMES.map(({ key }) => key))
    expect(listing.themes).toEqual(THEMES.map(({ key, label }) => ({ key, label })))
    expect(listing).toEqual({
      themes: listing.themes,
      minThemesPerRecord: MIN_THEMES_PER_RECORD,
      maxThemesPerRecord: MAX_THEMES_PER_RECORD,
      minRecordsPerTheme: MIN_RECORDS_PER_THEME,
    })
  })

  it('derives the listing from the table it reads, keeping only key and label', () => {
    const table = [
      ...THEMES,
      { key: 'new-theme', label: 'New theme', note: 'not listed' },
    ]

    const listing = handleListThemes(table)

    expect(listing.themes).toHaveLength(THEMES.length + 1)
    expect(listing.themes.at(-1)).toEqual({ key: 'new-theme', label: 'New theme' })
  })
})
