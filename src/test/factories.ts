import { createHostGate, type Admission, type HostGate, type Observation } from '@/lib/pipeline/host-gate'
import type { ManualDecision } from '@/lib/pipeline/sources'
import type { Agency, Policy, TimelineEvent } from '@/types'

export function buildPolicy(overrides: Partial<Policy> = {}): Policy {
  const effectiveDate = overrides.effectiveDate ?? '2025-01-01'
  const effectiveDateValue = effectiveDate instanceof Date
    ? effectiveDate.toISOString().slice(0, 10)
    : effectiveDate.slice(0, 10)
  return {
    id: 'policy-1',
    title: 'National AI Ethics Framework',
    description: 'A framework for safe and responsible AI use across government.',
    jurisdiction: 'federal',
    type: 'framework',
    status: 'active',
    effectiveDate,
    dates: overrides.dates ?? [
      {
        type: 'effective',
        date: effectiveDate,
        precision: 'day',
        primary: true,
        source: {
          url: 'https://example.gov.au/policies/national-ai-ethics-framework',
          contentHash: 'a'.repeat(64),
          reviewedDate: {
            date: effectiveDateValue,
            precision: 'day',
            reviewedAt: '2026-07-10T00:00:00.000Z',
            reviewedBy: 'test-reviewer',
            notes: 'Confirmed the effective date in the official source.',
          },
        },
      },
    ],
    agencies: ['Department of Industry'],
    sourceUrl: 'https://example.gov.au/policies/national-ai-ethics-framework',
    content: 'Detailed policy content',
    aiSummary: 'Responsible AI guardrails for government use.',
    tags: ['ai', 'ethics'],
    themes: ['responsible-ai', 'ai-governance'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    verification: {
      status: 'verified',
      checkedAt: '2026-07-10T00:00:00.000Z',
      checkedBy: 'test-reviewer',
      method: 'manual',
      source: {
        url: 'https://example.gov.au/policies/national-ai-ethics-framework',
        contentHash: 'a'.repeat(64),
      },
    },
    ...overrides,
  }
}

export function buildAgency(overrides: Partial<Agency> = {}): Agency {
  const website = overrides.website ?? 'https://example.gov.au/industry'
  return {
    id: 'agency-1',
    bodyId: 'disr',
    name: 'Department of Industry',
    acronym: 'DISR',
    level: 'federal',
    jurisdiction: 'federal',
    website,
    hasPublishedStatement: true,
    verification: {
      status: 'verified',
      checkedAt: '2026-07-10T00:00:00.000Z',
      checkedBy: 'test-reviewer',
      method: 'manual',
      source: {
        url: overrides.transparencyStatementUrl ?? website,
        contentHash: 'a'.repeat(64),
      },
    },
    ...overrides,
  }
}

export function buildTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  const sourceUrl =
    overrides.sourceUrl ?? 'https://example.gov.au/timeline/manual-event'
  return {
    id: 'timeline-1',
    date: '2025-02-01',
    datePrecision: 'day',
    title: 'Manual timeline event',
    description: 'A curated timeline milestone.',
    type: 'announcement',
    jurisdiction: 'federal',
    sourceUrl,
    verification: {
      status: 'verified',
      checkedAt: '2026-07-10T00:00:00.000Z',
      checkedBy: 'test-reviewer',
      method: 'manual',
      source: {
        url: sourceUrl,
        contentHash: 'a'.repeat(64),
        publishedAt: '2025-02-01',
        publishedAtPrecision: 'day',
      },
    },
    ...overrides,
  }
}

export function buildOpenHostGate(): HostGate {
  return createHostGate({
    hosts: {},
    refused: new Map(),
    fetchRobots: async () => ({ status: 404, body: '' }),
    now: Date.now,
    sleep: async () => {},
  })
}

export function buildRecordingHostGate(
  decide: (url: URL) => Admission = () => ({ kind: 'go' }),
): { gate: HostGate; admitted: string[]; observed: Array<[string, Observation]> } {
  const admitted: string[] = []
  const observed: Array<[string, Observation]> = []
  const gate: HostGate = {
    admit: async (url) => {
      admitted.push(url.toString())
      return decide(url)
    },
    observe: (url, outcome) => {
      observed.push([url.toString(), outcome])
    },
    hosts: () => ({}),
    waited: () => ({}),
  }
  return { gate, admitted, observed }
}

export function buildManualDecision(overrides: Partial<ManualDecision> = {}): ManualDecision {
  return {
    mode: 'manual',
    because: 'bot_blocked',
    decision: 'manual',
    since: '2026-10-01',
    decidedBy: 'Daniel',
    evidence: 'Returns 403 to every automated client, verified by hand.',
    ...overrides,
  }
}
