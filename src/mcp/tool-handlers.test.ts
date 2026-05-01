/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { stageSourceUrl, publishStagedSource, rejectStagedSource } = vi.hoisted(() => ({
  stageSourceUrl: vi.fn(),
  publishStagedSource: vi.fn(),
  rejectStagedSource: vi.fn(),
}))

vi.mock('@/lib/source-ingest', () => ({
  analyseSourceUrl: vi.fn(),
  auditMcpTool: vi.fn(),
  checkCoverage: vi.fn(),
  normalizeReviewStatus: vi.fn((status?: string) => status),
  stageSourceUrl,
  publishStagedSource,
  rejectStagedSource,
}))

vi.mock('@/lib/data-service', () => ({
  getSourceReviews: vi.fn(),
}))

import {
  handlePublishStagedSource,
  handleRejectStagedSource,
  handleStageSourceUrl,
} from './tool-handlers'

const originalToken = process.env.POLICAI_MCP_ADMIN_TOKEN

describe('MCP tool handlers', () => {
  beforeEach(() => {
    process.env.POLICAI_MCP_ADMIN_TOKEN = 'secret-token'
    stageSourceUrl.mockReset()
    publishStagedSource.mockReset()
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
      handlePublishStagedSource({ id: 'source-review-1', adminToken: 'wrong' }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    await expect(
      handleRejectStagedSource({ id: 'source-review-1', adminToken: 'wrong' }),
    ).rejects.toThrow('Invalid POLICAI_MCP_ADMIN_TOKEN')

    expect(stageSourceUrl).not.toHaveBeenCalled()
    expect(publishStagedSource).not.toHaveBeenCalled()
    expect(rejectStagedSource).not.toHaveBeenCalled()
  })
})
