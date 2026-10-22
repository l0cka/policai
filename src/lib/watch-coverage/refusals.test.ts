import { describe, expect, it } from 'vitest';
import { buildManualDecision } from '@/test/factories';
import type { Host } from '@/lib/pipeline/host';
import type { WatchSource } from '@/lib/pipeline/sources';
import type { Body, BodyId } from './bodies';
import { siteRefusals } from './refusals';

const bodies: Body[] = [
  { id: 'fed' as BodyId, name: 'Federal Agency', jurisdiction: 'federal', tier: 'A', hosts: ['www.fed.gov.au' as Host], scope: { status: 'unassessed' } },
  { id: 'qld' as BodyId, name: 'Queensland Agency', jurisdiction: 'qld', tier: 'B', hosts: ['www.qld.gov.au' as Host], scope: { status: 'unassessed' } },
];

function source(id: string, overrides: Partial<WatchSource>): WatchSource {
  return {
    id,
    name: id,
    bodyId: 'fed',
    jurisdiction: 'federal',
    category: 'government',
    url: `https://www.fed.gov.au/${id}`,
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    automation: 'automatic',
    ...overrides,
  };
}

describe('siteRefusals', () => {
  it('lists decided refusals and undecided ones from the ledger, by jurisdiction', () => {
    const rows = siteRefusals({
      bodies,
      sources: [
        source('qld-news', {
          bodyId: 'qld',
          jurisdiction: 'qld',
          url: 'https://www.qld.gov.au/news',
          automation: buildManualDecision({ because: 'bot_blocked', since: '2026-10-20' }),
        }),
        source('fed-news', {}),
        source('fed-policy', {
          automation: buildManualDecision({ because: 'bot_blocked', blockedHost: 'www.other.gov.au' }),
        }),
        source('fed-media', { automation: buildManualDecision({ because: 'identity_refused', decision: 'await_allowlist' }) }),
      ],
      sourceHealth: {
        'fed-news': {
          lastSuccessAt: null,
          firstFailureAt: '2026-10-21T19:30:00Z',
          consecutiveFailures: 2,
          lastFailureClass: 'identity_refused',
        },
      },
    });
    expect(rows.map((row) => [row.sourceId, row.host, row.tier, row.kind, row.since, row.response])).toEqual([
      ['fed-media', 'www.fed.gov.au', 'A', 'identity_refused', '2026-10-01', 'await_allowlist'],
      ['fed-news', 'www.fed.gov.au', 'A', 'identity_refused', '2026-10-21', 'undecided'],
      ['fed-policy', 'www.other.gov.au', 'A', 'bot_blocked', '2026-10-01', 'manual'],
      ['qld-news', 'www.qld.gov.au', 'B', 'bot_blocked', '2026-10-20', 'manual'],
    ]);
    expect(rows.find((row) => row.sourceId === 'fed-policy')?.linked).toBe(true);
  });

  it('leaves out pages that are gone, disabled sources and ordinary failures', () => {
    expect(
      siteRefusals({
        bodies,
        sources: [
          source('gone', { automation: buildManualDecision({ because: 'not_found' }) }),
          source('off', { enabled: false, automation: buildManualDecision({ because: 'bot_blocked' }) }),
          source('flaky', {}),
        ],
        sourceHealth: {
          flaky: { lastSuccessAt: null, firstFailureAt: '2026-10-21T00:00:00Z', consecutiveFailures: 3, lastFailureClass: 'timeout' },
        },
      }),
    ).toEqual([]);
  });
});
