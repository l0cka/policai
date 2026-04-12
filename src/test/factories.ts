import type { Agency, Policy, ScraperRunLog, TimelineEvent } from '@/types'

export function buildPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    title: 'National AI Ethics Framework',
    description: 'A framework for safe and responsible AI use across government.',
    jurisdiction: 'federal',
    type: 'framework',
    status: 'active',
    effectiveDate: '2025-01-01',
    agencies: ['Department of Industry'],
    sourceUrl: 'https://example.gov.au/policies/national-ai-ethics-framework',
    content: 'Detailed policy content',
    aiSummary: 'Responsible AI guardrails for government use.',
    tags: ['ai', 'ethics'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function buildAgency(overrides: Partial<Agency> = {}): Agency {
  return {
    id: 'agency-1',
    name: 'Department of Industry',
    acronym: 'DISR',
    level: 'federal',
    jurisdiction: 'federal',
    website: 'https://example.gov.au/industry',
    hasPublishedStatement: true,
    ...overrides,
  }
}

export function buildTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'timeline-1',
    date: '2025-02-01',
    title: 'Manual timeline event',
    description: 'A curated timeline milestone.',
    type: 'announcement',
    jurisdiction: 'federal',
    sourceUrl: 'https://example.gov.au/timeline/manual-event',
    ...overrides,
  }
}

export function buildScraperRunLog(overrides: Partial<ScraperRunLog> = {}): ScraperRunLog {
  return {
    id: 'run-1',
    timestamp: '2025-02-01T00:00:00.000Z',
    sourceId: 'source-1',
    sourceName: 'Department feed',
    linksFound: 3,
    policiesCreated: 1,
    errors: [],
    durationMs: 1200,
    ...overrides,
  }
}
