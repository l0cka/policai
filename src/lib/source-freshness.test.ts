import { describe, expect, it } from 'vitest';
import { buildManualDecision } from '@/test/factories';
import type { WatchSource } from '@/lib/pipeline/sources';
import {
  assessSourceFreshness,
  summarizeSourceFreshness,
  uncheckedSourceErrors,
} from '@/lib/source-freshness';
import type { ManualSourceReview } from '@/types';

const base: WatchSource = {
  id: 'daily-auto',
  bodyId: 'test-body',
  name: 'Daily automatic',
  jurisdiction: 'federal',
  category: 'government',
  url: 'https://example.gov.au/a',
  kind: 'html-index',
  schedule: 'daily',
  enabled: true,
  automation: 'automatic',
};
const NOW = new Date('2026-09-23T00:00:00.000Z');

describe('assessSourceFreshness', () => {
  it('classifies current, overdue, never-checked, manual and ignores disabled', () => {
    const rows = assessSourceFreshness(
      [
        base,
        { ...base, id: 'weekly-stale', schedule: 'weekly' },
        { ...base, id: 'weekly-ok', schedule: 'weekly' },
        { ...base, id: 'never' },
        { ...base, id: 'manual', automation: buildManualDecision() },
        { ...base, id: 'manual-silent', automation: buildManualDecision(), url: 'https://example.gov.au/silent' },
        { ...base, id: 'off', enabled: false },
      ],
      {
        'daily-auto': '2026-09-22T08:00:00.000Z',
        'weekly-stale': '2026-07-20T12:19:40.243Z',
        'weekly-ok': '2026-09-16T00:00:00.000Z',
        manual: '2026-07-18T20:12:16.563Z',
        'manual-silent': '2026-09-01T00:00:00.000Z',
      },
      NOW,
      {
        manualReviews: [
          {
            sourceId: 'manual',
            status: 'checked',
            reviewedAt: '2026-09-22T00:00:00.000Z',
            reviewedBy: 'Daniel',
            evidence: { url: 'https://example.gov.au/a' },
            notes: 'Checked the page by hand; nothing new.',
          } satisfies ManualSourceReview,
        ],
      },
    );
    const byId = Object.fromEntries(rows.map((row) => [row.sourceId, row]));
    expect(byId['daily-auto'].state).toBe('current');
    expect(byId['weekly-ok'].state).toBe('current');
    expect(byId['weekly-stale']).toMatchObject({ state: 'overdue', ageDays: 64 });
    expect(byId.never).toMatchObject({ state: 'never_checked', lastCheckedAt: null });
    expect(byId.manual.state).toBe('manual');
    expect(byId['manual-silent'].state).toBe('overdue');
    expect(byId.off).toBeUndefined();
    expect(rows[0].sourceId).toBe('weekly-stale');
  });

  it('treats an unparseable timestamp as never checked', () => {
    const [row] = assessSourceFreshness([base], { 'daily-auto': 'garbage' }, NOW);
    expect(row.state).toBe('never_checked');
  });

  it('summarises counts by state', () => {
    const rows = assessSourceFreshness(
      [base, { ...base, id: 'never' }],
      { 'daily-auto': '2026-09-10T00:00:00.000Z' },
      NOW,
    );
    expect(summarizeSourceFreshness(rows)).toEqual({
      current: 0,
      overdue: 1,
      neverChecked: 1,
      manual: 0,
    });
  });

  it('names a manual source with no current review once it is past the hand-check limit', () => {
    const silent = [
      'dta-media',
      'digital-gov-ai',
      'industry-ai-publications',
      'industry-ministers-media',
      'esafety-media',
    ] as const;
    const sources = silent.map((id) => ({
      ...base,
      id,
      schedule: id === 'esafety-media' ? ('weekly' as const) : ('daily' as const),
      automation: buildManualDecision(),
    }));
    const checked = Object.fromEntries(
      silent.map((id) => [id, '2026-10-17T19:33:37.000Z']),
    );
    const now = new Date('2026-11-01T19:34:15.392Z');
    const rows = assessSourceFreshness(sources, checked, now, { manualReviews: [] });
    expect(rows.every((row) => row.state === 'overdue')).toBe(true);
    const messages = uncheckedSourceErrors(sources, checked, { manualReviews: [] }, now);
    expect(messages.map((message) => message.split(':')[0])).toEqual([...silent]);
    expect(messages[0]).toContain('limit 2 days');
    expect(messages[4]).toContain('limit 8 days');
  });
});
