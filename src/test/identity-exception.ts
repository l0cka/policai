import type { WatchSource } from '@/lib/pipeline/sources'

const FIXTURE_EXCEPTION_SOURCE_ID = 'industry-ai-publications'

export function withFixtureIdentityException(sources: WatchSource[]): WatchSource[] {
  return sources.map((source) =>
    source.id === FIXTURE_EXCEPTION_SOURCE_ID
      ? { ...source, automation: 'automatic', identityException: { until: '2026-10-21', reason: 'fixture exception' } }
      : source,
  )
}
