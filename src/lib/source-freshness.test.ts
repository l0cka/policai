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
    // Staleness of a manual source stays on /status (the rows above); it is
    // not a run error, so it cannot hold the collector at degraded.
    expect(messages).toEqual([]);
  });

  it('uses one 8-day hand-check limit for every manual source, daily or weekly', () => {
    const now = new Date('2026-11-05T00:00:00.000Z');
    const review = (sourceId: string, reviewedAt: string): ManualSourceReview => ({
      sourceId,
      status: 'checked',
      reviewedAt,
      reviewedBy: 'Daniel',
      evidence: { url: 'https://example.gov.au/a' },
      notes: 'Checked the page by hand; nothing new.',
    });
    const sources = [
      { ...base, id: 'daily-manual', automation: buildManualDecision() },
      { ...base, id: 'weekly-manual', schedule: 'weekly' as const, automation: buildManualDecision() },
    ];
    const state = (reviewedAt: string) =>
      Object.fromEntries(
        assessSourceFreshness(sources, {}, now, {
          manualReviews: sources.map((source) => review(source.id, reviewedAt)),
        }).map((row) => [row.sourceId, row.state]),
      );
    expect(state('2026-10-29T00:00:00.000Z')).toEqual({
      'daily-manual': 'manual',
      'weekly-manual': 'manual',
    });
    expect(state('2026-10-27T00:00:00.000Z')).toEqual({
      'daily-manual': 'overdue',
      'weekly-manual': 'overdue',
    });
  });

  it('still names an automatic source that is overdue or never checked', () => {
    const sources = [
      { ...base, id: 'auto-stale' },
      { ...base, id: 'auto-never' },
      { ...base, id: 'manual-silent', automation: buildManualDecision() },
    ];
    const messages = uncheckedSourceErrors(
      sources,
      { 'auto-stale': '2026-09-01T00:00:00.000Z' },
      { manualReviews: [] },
      NOW,
    );
    expect(messages.map((message) => message.split(':')[0])).toEqual([
      'auto-stale',
      'auto-never',
    ]);
    expect(messages[0]).toContain('limit 3 days');
  });

  it('ages a manual source from its last hand review, not the watch-state check', () => {
    const source = { ...base, id: 'cyber-news', automation: buildManualDecision() };
    const now = new Date('2026-11-13T00:00:00.000Z');
    const monitoring = {
      manualReviews: [
        {
          sourceId: 'cyber-news',
          status: 'checked',
          reviewedAt: '2026-10-22T00:00:00.000Z',
          reviewedBy: 'Daniel',
        } satisfies ManualSourceReview,
      ],
    };
    const lastChecked = { 'cyber-news': '2026-10-22T00:00:00.000Z' };
    const watchStateOnly = { 'cyber-news': '2026-10-17T00:00:00.000Z' };

    const [row] = assessSourceFreshness([source], watchStateOnly, now, monitoring);
    expect(row.ageDays).toBe(22);
    expect(row.lastCheckedAt).toBe('2026-10-22T00:00:00.000Z');
    expect(uncheckedSourceErrors([source], lastChecked, monitoring, now)).toEqual([]);
  });
});
