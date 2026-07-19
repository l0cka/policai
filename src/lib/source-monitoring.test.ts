import { describe, expect, it } from 'vitest';
import type { WatchSource } from '@/lib/pipeline/sources';
import { summarizeManualSourceCoverage } from '@/lib/source-monitoring';

const daily: WatchSource = {
  id: 'daily-manual',
  name: 'Daily manual source',
  jurisdiction: 'federal',
  category: 'government',
  url: 'https://example.gov.au/daily',
  kind: 'html-index',
  schedule: 'daily',
  enabled: true,
  automation: 'manual',
};

const weekly: WatchSource = {
  ...daily,
  id: 'weekly-manual',
  name: 'Weekly manual source',
  url: 'https://example.gov.au/weekly',
  schedule: 'weekly',
};

describe('summarizeManualSourceCoverage', () => {
  it('separates current, overdue, unavailable, and never-reviewed sources', () => {
    const coverage = summarizeManualSourceCoverage(
      [
        daily,
        weekly,
        {
          ...weekly,
          id: 'overdue',
          url: 'https://example.gov.au/overdue',
        },
        {
          ...weekly,
          id: 'expired-unavailable',
          url: 'https://example.gov.au/expired-unavailable',
        },
        {
          ...weekly,
          id: 'never',
          url: 'https://example.gov.au/never',
        },
      ],
      {
        manualReviews: [
          {
            sourceId: daily.id,
            status: 'checked',
            reviewedAt: '2026-07-15T00:00:00.000Z',
            reviewedBy: 'editor',
            evidence: { url: daily.url },
            notes: 'Inspected the complete source listing in a browser.',
          },
          {
            sourceId: weekly.id,
            status: 'source_unavailable',
            reviewedAt: '2026-07-10T00:00:00.000Z',
            reviewedBy: 'editor',
            evidence: { url: weekly.url },
            notes: 'The source was unavailable throughout the manual check.',
          },
          {
            sourceId: 'overdue',
            status: 'checked',
            reviewedAt: '2026-07-01T00:00:00.000Z',
            reviewedBy: 'editor',
            evidence: { url: 'https://example.gov.au/overdue' },
            notes: 'Inspected the complete source listing in a browser.',
          },
          {
            sourceId: 'expired-unavailable',
            status: 'source_unavailable',
            reviewedAt: '2026-07-01T00:00:00.000Z',
            reviewedBy: 'editor',
            evidence: {
              url: 'https://example.gov.au/expired-unavailable',
            },
            notes: 'The source was unavailable throughout the manual check.',
          },
        ],
      },
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(coverage).toEqual({
      total: 5,
      current: 1,
      unavailable: 1,
      overdue: 2,
      neverReviewed: 1,
    });
  });

  it('does not treat a materially future review as current coverage', () => {
    const coverage = summarizeManualSourceCoverage(
      [daily],
      {
        manualReviews: [
          {
            sourceId: daily.id,
            status: 'checked',
            reviewedAt: '2026-07-20T00:00:00.000Z',
            reviewedBy: 'editor',
          },
        ],
      },
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(coverage).toEqual({
      total: 1,
      current: 0,
      unavailable: 0,
      overdue: 1,
      neverReviewed: 0,
    });
  });
});
