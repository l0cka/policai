/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTimelineEvent } from '@/test/factories'

const { getTimelineEvents } = vi.hoisted(() => ({
  getTimelineEvents: vi.fn(),
}))

vi.mock('@/lib/data-service', () => ({
  getTimelineEvents,
}))

import { GET } from './route'

describe('/api/timeline', () => {
  beforeEach(() => {
    getTimelineEvents.mockReset()
  })

  it('returns timeline events and forwards the jurisdiction filter', async () => {
    const events = [buildTimelineEvent({ id: 'timeline-a' })]
    getTimelineEvents.mockResolvedValue(events)

    const response = await GET(new Request('https://example.com/api/timeline?jurisdiction=federal'))

    expect(getTimelineEvents).toHaveBeenCalledWith({ jurisdiction: 'federal' })
    await expect(response.json()).resolves.toEqual({
      data: events,
      total: 1,
      success: true,
    })
  })
})
