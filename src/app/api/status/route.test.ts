/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildScraperRunLog } from '@/test/factories'

const { getLatestPipelineRun, getRecentScraperRuns } = vi.hoisted(() => ({
  getLatestPipelineRun: vi.fn(),
  getRecentScraperRuns: vi.fn(),
}))

vi.mock('@/lib/agents/pipeline-storage', () => ({
  getLatestPipelineRun,
}))

vi.mock('@/lib/data-service', () => ({
  getRecentScraperRuns,
}))

import { GET } from './route'

describe('/api/status', () => {
  beforeEach(() => {
    getLatestPipelineRun.mockReset()
    getRecentScraperRuns.mockReset()
  })

  it('returns null run summaries when there is no pipeline or scraper history', async () => {
    getLatestPipelineRun.mockResolvedValue(null)
    getRecentScraperRuns.mockResolvedValue([])

    const response = await GET()

    await expect(response.json()).resolves.toEqual({
      lastPipelineRun: null,
      lastScrapeRun: null,
      success: true,
    })
  })

  it('returns condensed status information for the latest pipeline and scraper runs', async () => {
    getLatestPipelineRun.mockResolvedValue({
      id: 'pipeline-1',
      stage: 'verification_complete',
      startedAt: '2025-02-01T00:00:00.000Z',
      completedAt: '2025-02-01T00:10:00.000Z',
      findingsCount: 8,
      implementedCount: 3,
      rejectedCount: 1,
    })
    getRecentScraperRuns.mockResolvedValue([
      buildScraperRunLog({
        timestamp: '2025-02-02T00:00:00.000Z',
        sourceName: 'Federal Register',
        policiesCreated: 2,
      }),
    ])

    const response = await GET()

    await expect(response.json()).resolves.toEqual({
      lastPipelineRun: {
        id: 'pipeline-1',
        stage: 'verification_complete',
        startedAt: '2025-02-01T00:00:00.000Z',
        completedAt: '2025-02-01T00:10:00.000Z',
        findingsCount: 8,
        implementedCount: 3,
      },
      lastScrapeRun: {
        timestamp: '2025-02-02T00:00:00.000Z',
        sourceName: 'Federal Register',
        policiesCreated: 2,
      },
      success: true,
    })
  })
})
