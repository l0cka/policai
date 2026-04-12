/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAgency, buildPolicy, buildScraperRunLog, buildTimelineEvent } from '@/test/factories'

const readJsonFile = vi.fn()
const writeJsonFile = vi.fn()

vi.mock('@/lib/file-store', () => ({
  readJsonFile,
  writeJsonFile,
}))

const originalEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

async function loadDataServiceModule() {
  vi.resetModules()
  return import('./data-service')
}

describe('data-service JSON fallback', () => {
  beforeEach(() => {
    readJsonFile.mockReset()
    writeJsonFile.mockReset()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.supabaseUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.supabaseAnonKey
  })

  it('filters and sorts policies from the JSON fallback', async () => {
    const older = buildPolicy({
      id: 'older-policy',
      title: 'Older ethics policy',
      effectiveDate: '2024-01-01',
      tags: ['ethics'],
    })
    const newer = buildPolicy({
      id: 'newer-policy',
      title: 'Newer ethics policy',
      effectiveDate: '2025-03-01',
      tags: ['ethics', 'governance'],
    })
    const excluded = buildPolicy({
      id: 'excluded-policy',
      jurisdiction: 'nsw',
      tags: ['other'],
    })

    readJsonFile.mockResolvedValue([older, newer, excluded])

    const { getPolicies } = await loadDataServiceModule()
    const result = await getPolicies({
      jurisdiction: 'federal',
      search: 'ethics',
    })

    expect(result.map((policy) => policy.id)).toEqual(['newer-policy', 'older-policy'])
  })

  it('throws a typed error when a duplicate policy is created', async () => {
    const existing = buildPolicy()
    readJsonFile.mockResolvedValue([existing])

    const { createPolicy, DuplicatePolicyError } = await loadDataServiceModule()

    await expect(createPolicy(existing)).rejects.toBeInstanceOf(DuplicatePolicyError)
    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('adds and removes trashed metadata when policy status changes', async () => {
    const policy = buildPolicy()
    readJsonFile.mockResolvedValue([policy])

    const { updatePolicy } = await loadDataServiceModule()

    const trashed = await updatePolicy(policy.id, { status: 'trashed' })
    expect(trashed).toEqual(
      expect.objectContaining({
        status: 'trashed',
        trashedAt: expect.any(String),
      }),
    )

    const persistedAfterTrash = writeJsonFile.mock.calls[0]?.[1]?.[0]
    expect(persistedAfterTrash).toEqual(expect.objectContaining({ status: 'trashed', trashedAt: expect.any(String) }))

    readJsonFile.mockResolvedValue([
      {
        ...policy,
        status: 'trashed',
        trashedAt: '2025-01-02T00:00:00.000Z',
      },
    ])

    const restored = await updatePolicy(policy.id, { status: 'active' })
    expect(restored).toEqual(expect.objectContaining({ status: 'active' }))
    expect(restored).not.toHaveProperty('trashedAt')
  })

  it('filters agencies and sorts them alphabetically', async () => {
    readJsonFile.mockResolvedValue([
      buildAgency({ id: 'a-2', name: 'Zeta Office' }),
      buildAgency({ id: 'a-1', name: 'Alpha Office' }),
      buildAgency({ id: 'a-3', level: 'state', jurisdiction: 'nsw', name: 'NSW Office' }),
    ])

    const { getAgencies } = await loadDataServiceModule()
    const result = await getAgencies({ level: 'federal' })

    expect(result.map((agency) => agency.name)).toEqual(['Alpha Office', 'Zeta Office'])
  })

  it('merges curated and generated timeline events without duplicating curated policy entries', async () => {
    const coveredPolicy = buildPolicy({
      id: 'covered-policy',
      title: 'Covered policy',
      effectiveDate: '2025-01-10',
    })
    const generatedPolicy = buildPolicy({
      id: 'generated-policy',
      title: 'Generated policy',
      effectiveDate: '2025-01-20',
      description: 'x'.repeat(240),
    })
    const manualEvent = buildTimelineEvent({
      id: 'manual-event',
      date: '2025-01-05',
      relatedPolicyId: coveredPolicy.id,
    })

    readJsonFile
      .mockResolvedValueOnce([coveredPolicy, generatedPolicy])
      .mockResolvedValueOnce([manualEvent])

    const { getTimelineEvents } = await loadDataServiceModule()
    const result = await getTimelineEvents({ jurisdiction: 'federal' })

    expect(result.map((event) => event.id)).toEqual(['manual-event', 'policy-timeline-generated-policy'])
    expect(result[1]).toEqual(
      expect.objectContaining({
        title: 'Generated policy',
        description: `${'x'.repeat(197)}...`,
      }),
    )
  })

  it('caps persisted scraper logs at the most recent 100 entries', async () => {
    readJsonFile.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) =>
        buildScraperRunLog({ id: `existing-${index}`, timestamp: `2025-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }),
      ),
    )

    const { logScraperRun } = await loadDataServiceModule()
    await logScraperRun(buildScraperRunLog({ id: 'latest-run' }))

    const persistedRuns = writeJsonFile.mock.calls[0]?.[1]
    expect(persistedRuns).toHaveLength(100)
    expect(persistedRuns[0]).toEqual(expect.objectContaining({ id: 'latest-run' }))
    expect(persistedRuns.at(-1)).toEqual(expect.objectContaining({ id: 'existing-98' }))
  })
})
