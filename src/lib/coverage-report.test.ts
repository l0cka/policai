import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { WatchSource } from '@/lib/pipeline/sources';
import {
  buildJurisdictionCoverage,
  buildRecordReviewSchedule,
  summarizeRecordCompleteness,
  summarizeRecordFreshness,
  summarizeReviewQueue,
} from '@/lib/coverage-report';

const source: WatchSource = {
  id: 's',
  name: 'S',
  jurisdiction: 'tas',
  category: 'government',
  url: 'https://example.tas.gov.au/',
  kind: 'html-index',
  schedule: 'weekly',
  enabled: true,
  automation: 'automatic',
};

describe('buildJurisdictionCoverage', () => {
  it('counts records, binding instruments and sources for every jurisdiction', () => {
    const rows = buildJurisdictionCoverage(
      [
        buildPolicy({ id: 'a', jurisdiction: 'tas', type: 'regulation' }),
        buildPolicy({ id: 'b', jurisdiction: 'tas', type: 'guideline' }),
      ],
      [
        source,
        { ...source, id: 'm', automation: 'manual' },
        { ...source, id: 'x', enabled: false },
      ],
    );
    expect(rows).toHaveLength(9);
    expect(rows.find((row) => row.jurisdiction === 'tas')).toEqual({
      jurisdiction: 'tas',
      publicRecords: 2,
      bindingRecords: 1,
      automaticSources: 1,
      manualSources: 1,
    });
    expect(rows.find((row) => row.jurisdiction === 'nt')?.publicRecords).toBe(0);
  });
});

describe('summarizeReviewQueue', () => {
  it('reports pending count and oldest age in days', () => {
    expect(
      summarizeReviewQueue(
        [
          { discoveredAt: '2026-09-20T00:00:00.000Z' },
          { discoveredAt: '2026-09-01T00:00:00.000Z' },
        ],
        new Date('2026-09-23T00:00:00.000Z'),
      ),
    ).toEqual({ pending: 2, oldestAgeDays: 22 });
  });

  it('reports an empty queue without an age', () => {
    expect(summarizeReviewQueue([])).toEqual({ pending: 0, oldestAgeDays: null });
  });
});

describe('summarizeRecordFreshness', () => {
  const now = new Date('2026-10-20T00:00:00.000Z');
  const checkedOn = (id: string, checkedAt: string) => {
    const policy = buildPolicy({ id });
    policy.verification.checkedAt = checkedAt;
    return policy;
  };

  it('uses the editorial review interval for every record type', () => {
    const summary = summarizeRecordFreshness(
      [
        checkedOn('recent', '2026-09-01T00:00:00.000Z'),
        checkedOn('edge', '2026-07-22T00:00:00.000Z'),
        checkedOn('old', '2026-07-01T00:00:00.000Z'),
      ],
      now,
    );
    expect(summary).toEqual({
      reviewed: 3,
      overdue: 1,
      overdueIds: ['old'],
      oldestAgeDays: 111,
    });
  });

  it('counts a record with no review time as overdue', () => {
    const policy = buildPolicy({ id: 'never', lastReviewedAt: undefined });
    policy.verification.checkedAt = undefined;
    expect(summarizeRecordFreshness([policy], now)).toMatchObject({
      reviewed: 0,
      overdue: 1,
      overdueIds: ['never'],
    });
  });
});

describe('buildRecordReviewSchedule', () => {
  it('sorts soonest-due first with days left', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    const a = buildPolicy({ id: 'a' });
    a.verification.checkedAt = '2026-09-01T00:00:00.000Z';
    const b = buildPolicy({ id: 'b' });
    b.verification.checkedAt = '2026-07-15T00:00:00.000Z';
    const rows = buildRecordReviewSchedule([a, b], now);
    expect(rows.map((row) => [row.id, row.daysLeft, row.overdue])).toEqual([
      ['b', 12, false],
      ['a', 60, false],
    ]);
    expect(rows[0].dueAt).toBe('2026-10-13T00:00:00.000Z');
  });
});

describe('summarizeRecordCompleteness', () => {
  it('reports each missing expected field without failing the record', () => {
    const full = buildPolicy({ id: 'full', lastReviewedAt: '2026-09-01T00:00:00.000Z' });
    const thin = buildPolicy({ id: 'thin', agencies: [], tags: [' '], lastReviewedAt: undefined });
    const summary = summarizeRecordCompleteness([full, thin]);
    expect(summary.total).toBe(2);
    expect(summary.missing.agencies).toEqual(['thin']);
    expect(summary.missing.tags).toEqual(['thin']);
    expect(summary.missing.reviewStamp).toEqual(['thin']);
    expect(summary.complete).toBe(1);
  });
});
