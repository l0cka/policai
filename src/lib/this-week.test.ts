/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import type { Development, Policy } from '@/types';
import {
  selectUpcomingPolicyDates,
  selectWeeklyDevelopments,
  weekWindowEndingAt,
  weeklyEvidenceLabel,
} from './this-week';

const ANCHOR = '2026-09-20T19:33:45.435Z';

function development(
  overrides: Partial<Development> & { id: string },
): Development {
  return {
    title: overrides.id,
    url: 'https://www.example.gov.au/',
    sourceId: 'test-source',
    sourceName: 'Test source',
    jurisdiction: 'federal',
    detectedAt: ANCHOR,
    relevanceScore: 0.65,
    classification: 'heuristic',
    assessment: {
      method: 'heuristic',
      assessedAt: ANCHOR,
      promptVersion: 'test',
    },
    verification: { status: 'verified', source: { url: 'https://www.example.gov.au/' } },
    status: 'detected',
    ...overrides,
  } as Development;
}

function policy(overrides: Partial<Policy> & { id: string }): Policy {
  return {
    title: overrides.id,
    description: '',
    jurisdiction: 'federal',
    type: 'guideline',
    status: 'active',
    effectiveDate: '2026-01-01',
    dates: [],
    agencies: [],
    sourceUrl: 'https://www.example.gov.au/',
    content: '',
    aiSummary: '',
    tags: [],
    createdAt: ANCHOR,
    updatedAt: ANCHOR,
    verification: {
      status: 'verified',
      source: { url: 'https://www.example.gov.au/' },
    },
    ...overrides,
  } as Policy;
}

describe('weekWindowEndingAt', () => {
  it('derives a 7-day window ending at the collection anchor', () => {
    const window = weekWindowEndingAt(ANCHOR);
    expect(window).not.toBeNull();
    expect(window!.end).toBe(new Date(ANCHOR).getTime());
    expect(window!.end - window!.start).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('returns null without an anchor so pages stay render-pure', () => {
    expect(weekWindowEndingAt(null)).toBeNull();
    expect(weekWindowEndingAt('')).toBeNull();
    expect(weekWindowEndingAt('not-a-date')).toBeNull();
  });
});

describe('selectWeeklyDevelopments', () => {
  const window = weekWindowEndingAt(ANCHOR)!;

  it('keeps only verified, non-dismissed detections inside the window', () => {
    const items = [
      development({ id: 'in-window', detectedAt: '2026-09-18T00:00:00.000Z' }),
      development({
        id: 'dismissed-in-window',
        status: 'dismissed',
        detectedAt: '2026-09-17T00:00:00.000Z',
      }),
      development({
        id: 'unverified-in-window',
        verification: {
          status: 'needs_review',
          source: { url: 'https://www.example.gov.au/' },
        },
        detectedAt: '2026-09-16T00:00:00.000Z',
      }),
      development({
        id: 'before-window',
        detectedAt: '2026-09-01T00:00:00.000Z',
      }),
    ];
    const selected = selectWeeklyDevelopments(items, window);
    expect(selected.map((item) => item.id)).toEqual(['in-window']);
  });

  it('ranks direct-document change detections (score 1) above machine-scored items', () => {
    const items = [
      development({
        id: 'machine-strong',
        relevanceScore: 0.65,
        detectedAt: '2026-09-19T00:00:00.000Z',
      }),
      development({
        id: 'direct-change',
        relevanceScore: 1,
        classification: 'ai',
        detectedAt: '2026-09-18T00:00:00.000Z',
      }),
      development({
        id: 'direct-change-newer',
        relevanceScore: 1,
        classification: 'ai',
        detectedAt: '2026-09-19T12:00:00.000Z',
      }),
    ];
    const selected = selectWeeklyDevelopments(items, window);
    expect(selected.map((item) => item.id)).toEqual([
      'direct-change-newer',
      'direct-change',
      'machine-strong',
    ]);
  });

  it('includes developments detected exactly at the window boundary', () => {
    const itemsAtStart = [
      development({ id: 'boundary', detectedAt: new Date(window.start).toISOString() }),
    ];
    expect(selectWeeklyDevelopments(itemsAtStart, window).map((i) => i.id)).toEqual([
      'boundary',
    ]);
  });

  it('does not mutate the input order', () => {
    const machineStrong = development({ id: 'a', relevanceScore: 0.65 });
    const directChange = development({ id: 'b', relevanceScore: 1 });
    const items = [machineStrong, directChange];
    selectWeeklyDevelopments(items, window);
    expect(items.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('weeklyEvidenceLabel', () => {
  it('labels curated entries as editorial', () => {
    expect(
      weeklyEvidenceLabel(development({ id: 'x', classification: 'curated' })),
    ).toBe('Editorial');
  });

  it('labels score-1 detections as direct source changes', () => {
    expect(
      weeklyEvidenceLabel(
        development({ id: 'x', classification: 'ai', relevanceScore: 1 }),
      ),
    ).toBe('Direct source change');
  });

  it('states the 0.65 machine-confidence cap otherwise', () => {
    expect(
      weeklyEvidenceLabel(
        development({ id: 'x', classification: 'ai', relevanceScore: 0.65 }),
      ),
    ).toBe('Machine detected (confidence capped at 0.65)');
  });
});

describe('selectUpcomingPolicyDates', () => {
  const upcomingWindow = weekWindowEndingAt(ANCHOR)!;

  it('includes today in Sydney and amended instruments without admitting unverified records', () => {
    const window = weekWindowEndingAt('2026-09-20T23:30:00Z')!;
    const dates: Policy['dates'] = [{ type: 'effective', date: '2026-09-21', precision: 'day' }];
    expect(selectUpcomingPolicyDates([
      policy({ id: 'today', dates }),
      policy({ id: 'amended', status: 'amended', dates }),
      policy({ id: 'unverified', dates, verification: { status: 'needs_review', source: { url: 'https://example.gov.au' } } }),
    ], window).map(i => i.policyId)).toEqual(['amended', 'today']);
  });

  it('retains a current month or year without inventing an exact date', () => {
    const items = [
      policy({ id: 'month', dates: [{ type: 'effective', date: '2026-09-01', precision: 'month' }] }),
      policy({ id: 'year', dates: [{ type: 'effective', date: '2026-01-01', precision: 'year' }] }),
      policy({ id: 'past-month', dates: [{ type: 'effective', date: '2026-08-01', precision: 'month' }] }),
    ];
    expect(selectUpcomingPolicyDates(items, upcomingWindow).map(i => i.policyId)).toEqual(['year', 'month']);
  });

  it('rejects impossible calendar dates and deduplicates repeated dates', () => {
    const dates: Policy['dates'] = [
      { type: 'effective', date: '2027-02-30', precision: 'day' },
      { type: 'commenced', date: '2026-11-05', precision: 'day' },
      { type: 'commenced', date: '2026-11-05', precision: 'day' },
    ];
    expect(selectUpcomingPolicyDates([policy({ id: 'x', dates })], upcomingWindow).map(i => i.date)).toEqual(['2026-11-05']);
  });

  it('finds future commencement and consultation dates on proposed/active policies', () => {
    const items = [
      policy({
        id: 'future-commencement',
        status: 'active',
        dates: [
          {
            type: 'effective',
            date: '2026-10-20',
            precision: 'day',
            primary: true,
          },
        ],
      }),
      policy({
        id: 'future-consultation',
        status: 'proposed',
        jurisdiction: 'nsw',
        dates: [
          {
            type: 'consultation_closed',
            date: '2026-12-01',
            precision: 'day',
          },
        ],
      }),
    ];
    const selected = selectUpcomingPolicyDates(items, upcomingWindow);
    expect(selected.map((item) => item.policyId)).toEqual([
      'future-commencement',
      'future-consultation',
    ]);
    expect(selected[0].dateType).toBe('effective');
    expect(selected[0].date).toBe('2026-10-20');
    expect(selected[1].dateType).toBe('consultation_closed');
  });

  it('skips past dates, superseded records and unrelated date types', () => {
    const items = [
      policy({
        id: 'past-date',
        dates: [{ type: 'effective', date: '2026-01-01', precision: 'day' }],
      }),
      policy({
        id: 'superseded',
        status: 'superseded',
        dates: [{ type: 'effective', date: '2026-12-01', precision: 'day' }],
      }),
      policy({
        id: 'published-only',
        dates: [{ type: 'published', date: '2026-12-01', precision: 'day' }],
      }),
    ];
    expect(selectUpcomingPolicyDates(items, upcomingWindow)).toEqual([]);
  });

  it('sorts soonest first and handles month/year precision and Date objects', () => {
    const items = [
      policy({
        id: 'later',
        dates: [{ type: 'effective', date: '2027-01-01', precision: 'month' }],
      }),
      policy({
        id: 'sooner',
        dates: [
          {
            type: 'commenced',
            date: new Date('2026-11-05T00:00:00.000Z'),
            precision: 'day',
          },
        ],
      }),
    ];
    const selected = selectUpcomingPolicyDates(items, upcomingWindow);
    expect(selected.map((item) => item.policyId)).toEqual(['sooner', 'later']);
    expect(selected[0].date).toBe('2026-11-05');
  });
});