import { describe, expect, it } from 'vitest';
import type { WatchSource } from '@/lib/pipeline/sources';
import {
  assessSourceFreshness,
  summarizeSourceFreshness,
} from '@/lib/source-freshness';

const base: WatchSource = {
  id: 'daily-auto',
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
        { ...base, id: 'manual', automation: 'manual' },
        { ...base, id: 'off', enabled: false },
      ],
      {
        'daily-auto': '2026-09-22T08:00:00.000Z',
        'weekly-stale': '2026-07-20T12:19:40.243Z',
        'weekly-ok': '2026-09-16T00:00:00.000Z',
        manual: '2026-07-18T20:12:16.563Z',
      },
      NOW,
    );
    const byId = Object.fromEntries(rows.map((row) => [row.sourceId, row]));
    expect(byId['daily-auto'].state).toBe('current');
    expect(byId['weekly-ok'].state).toBe('current');
    expect(byId['weekly-stale']).toMatchObject({ state: 'overdue', ageDays: 64 });
    expect(byId.never).toMatchObject({ state: 'never_checked', lastCheckedAt: null });
    expect(byId.manual.state).toBe('manual');
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
});
