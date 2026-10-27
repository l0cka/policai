import { describe, expect, it } from 'vitest';
import { buildManualDecision } from '@/test/factories';
import type { WatchSource } from '@/lib/pipeline/sources';
import type { Host } from '@/lib/pipeline/host';
import type { Body, BodyId, Tier } from './bodies';
import { sourceStanding, watchCoverage, type WatchCoverageInput } from './report';

const NOW = new Date('2026-10-22T00:00:00Z');

function body(id: string, jurisdiction: Body['jurisdiction'], tier: Tier, scope: Body['scope'] = { status: 'unassessed' }): Body {
  return { id: id as BodyId, name: `Body ${id}`, jurisdiction, tier, hosts: [`${id}.gov.au` as Host], scope };
}

function source(id: string, bodyId: string, overrides: Partial<WatchSource> = {}): WatchSource {
  return {
    id,
    name: id,
    bodyId,
    jurisdiction: 'federal',
    category: 'government',
    url: `https://${bodyId}.gov.au/news`,
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
    ...overrides,
  };
}

function input(overrides: Partial<WatchCoverageInput>): WatchCoverageInput {
  return {
    bodies: [],
    sources: [],
    sourceHealth: {},
    checkTimes: {},
    monitoring: { manualReviews: [] },
    sourceResults: [],
    now: NOW,
    ...overrides,
  };
}

const failing = (cls: 'http_error' | 'identity_refused') => ({
  lastSuccessAt: '2026-10-01T00:00:00Z',
  firstFailureAt: '2026-10-20T00:00:00Z',
  consecutiveFailures: 2,
  lastFailureClass: cls,
});

describe('sourceStanding', () => {
  it('vouches for a source the ledger has not recorded from its last completed check', () => {
    expect(sourceStanding(source('s', 'b'), undefined, '2026-10-21T00:00:00Z', { manualReviews: [] }, NOW)).toEqual({
      kind: 'ok',
      lastSuccessAt: '2026-10-21T00:00:00Z',
    });
    expect(sourceStanding(source('s', 'b'), undefined, undefined, { manualReviews: [] }, NOW)).toEqual({
      kind: 'not_yet_run',
    });
  });

  it('separates an undecided refusal from an ordinary failure', () => {
    const monitoring = { manualReviews: [] };
    expect(sourceStanding(source('s', 'b'), failing('identity_refused'), undefined, monitoring, NOW)).toMatchObject({
      kind: 'refusal_undecided',
      cls: 'identity_refused',
      runs: 2,
    });
    expect(sourceStanding(source('s', 'b'), failing('http_error'), undefined, monitoring, NOW)).toMatchObject({
      kind: 'failing',
      cls: 'http_error',
    });
  });

  it('flags a manual source with no current review as overdue', () => {
    const manual = source('m', 'b', { automation: buildManualDecision() });
    expect(sourceStanding(manual, undefined, undefined, { manualReviews: [] }, NOW)).toMatchObject({
      kind: 'manual',
      lastReviewedAt: null,
      overdue: true,
    });
    const reviewed = {
      sourceId: 'm',
      status: 'checked' as const,
      reviewedAt: '2026-10-21T09:00:00Z',
      reviewedBy: 'Daniel',
      evidence: { url: manual.url, title: 'News' },
      notes: 'Checked the news index by hand, nothing new on AI.',
    };
    expect(sourceStanding(manual, undefined, undefined, { manualReviews: [reviewed] }, NOW)).toMatchObject({
      kind: 'manual',
      lastReviewedAt: '2026-10-21T09:00:00Z',
      overdue: false,
    });
  });
});

describe('watchCoverage', () => {
  const bodies = [
    body('auto', 'federal', 'A'),
    body('hand', 'federal', 'A'),
    body('broken', 'federal', 'A'),
    body('none', 'federal', 'A'),
    body('mixed', 'federal', 'B'),
    body('dropped', 'federal', 'C', { status: 'out_of_scope', decidedAt: '2026-10-20', decidedBy: 'Editor', reason: 'No AI remit' }),
    body('state', 'nsw', 'A', { status: 'in_scope', decidedAt: '2026-10-20', decidedBy: 'Editor' }),
  ];
  const sources = [
    source('auto-news', 'auto'),
    source('hand-news', 'hand', { automation: buildManualDecision({ because: 'identity_refused' }) }),
    source('broken-news', 'broken'),
    source('none-old', 'none', { enabled: false }),
    source('mixed-a', 'mixed'),
    source('mixed-b', 'mixed'),
    source('state-news', 'state', { jurisdiction: 'nsw' }),
  ];
  const report = watchCoverage(
    input({
      bodies,
      sources,
      sourceHealth: {
        'broken-news': failing('identity_refused'),
        'mixed-a': failing('http_error'),
        'mixed-b': { lastSuccessAt: '2026-10-21T00:00:00Z', firstFailureAt: null, consecutiveFailures: 0, lastFailureClass: null },
      },
      checkTimes: { 'auto-news': '2026-10-21T00:00:00Z' },
      sourceResults: [
        {
          sourceId: 'auto-news',
          status: 'success',
          checkedAt: '2026-10-21T00:00:00Z',
          durationMs: 10,
          itemCount: 1,
          candidateCount: 0,
          newCandidateCount: 0,
          skippedLinked: [{ url: 'https://hand.gov.au/a.pdf', because: 'decided_block', decidedBy: 'hand-news' }],
        },
      ],
    }),
  );

  it('counts each in-scope body once per jurisdiction and tier', () => {
    expect(report.cells).toEqual([
      { jurisdiction: 'federal', tier: 'A', bodies: 4, automatic: 1, manual: 1, failing: 1, pending: 0, uncovered: 1 },
      { jurisdiction: 'federal', tier: 'B', bodies: 1, automatic: 1, manual: 0, failing: 0, pending: 0, uncovered: 0 },
      { jurisdiction: 'nsw', tier: 'A', bodies: 1, automatic: 0, manual: 0, failing: 0, pending: 1, uncovered: 0 },
    ]);
    expect(report.unassessed).toBe(5);
  });

  it('lists gaps tier first, ignoring disabled sources and out-of-scope bodies', () => {
    expect(report.gaps.map((gap) => [gap.bodyId, gap.coverage])).toEqual([
      ['broken', 'failing'],
      ['none', 'uncovered'],
      ['state', 'pending'],
    ]);
  });

  it('keeps every decided block, undecided refusal and skipped document visible', () => {
    expect(report.blocks).toEqual([
      expect.objectContaining({ sourceId: 'hand-news', bodyId: 'hand', overdue: true, lastReviewedAt: null }),
    ]);
    expect(report.undecidedRefusals).toEqual([
      { sourceId: 'broken-news', since: '2026-10-20T00:00:00Z', runs: 2, cls: 'identity_refused' },
    ]);
    expect(report.skippedLinked).toEqual([
      { sourceId: 'auto-news', url: 'https://hand.gov.au/a.pdf', because: 'decided_block', decidedBy: 'hand-news' },
    ]);
  });
});
