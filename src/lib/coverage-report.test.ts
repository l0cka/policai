import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { WatchSource } from '@/lib/pipeline/sources';
import {
  buildJurisdictionCoverage,
  RECORD_REVIEW_MAX_AGE_DAYS,
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

  it('uses stricter limits for binding law than for guidance', () => {
    expect(RECORD_REVIEW_MAX_AGE_DAYS).toEqual({
      binding: 90,
      courtAndStandard: 180,
      other: 365,
    });
  });

  it('counts records past the limit for their class', () => {
    const summary = summarizeRecordFreshness(
      [
        buildPolicy({ id: 'law', type: 'legislation', lastReviewedAt: '2026-07-20T00:00:00.000Z' }),
        buildPolicy({ id: 'reg', type: 'regulation', lastReviewedAt: '2026-08-01T00:00:00.000Z' }),
        buildPolicy({ id: 'note', type: 'practice_note', lastReviewedAt: '2026-04-01T00:00:00.000Z' }),
        buildPolicy({ id: 'guide', type: 'guideline', lastReviewedAt: '2026-05-01T00:00:00.000Z' }),
      ],
      now,
    );

    expect(summary).toEqual({
      reviewed: 4,
      overdue: 2,
      overdueIds: ['law', 'note'],
      oldestAgeDays: 202,
    });
  });

  it('falls back to the verification check time when no review is stamped', () => {
    const policy = buildPolicy({ id: 'unstamped', type: 'legislation', lastReviewedAt: undefined });
    policy.verification.checkedAt = '2026-06-01T00:00:00.000Z';
    expect(summarizeRecordFreshness([policy], now)).toMatchObject({
      overdue: 1,
      overdueIds: ['unstamped'],
    });
  });
});
