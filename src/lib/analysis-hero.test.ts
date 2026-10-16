import { describe, expect, it } from 'vitest';
import { selectAnalysisHero } from '@/lib/analysis-hero';
import type { ArticleType, PublishedArticle } from '@/types';

function piece(slug: string, type: ArticleType): PublishedArticle {
  return {
    slug,
    type,
    title: slug,
    summary: slug,
    status: 'published',
    publishedAt: '2026-10-14',
    cites: [],
    sources: [],
    corrections: [],
    body: '',
    blocks: [],
  } as PublishedArticle;
}

describe('selectAnalysisHero', () => {
  it('returns null when there are no pieces', () => {
    expect(selectAnalysisHero([])).toBeNull();
  });

  it('uses a lone piece as the lead with nothing beside it', () => {
    const only = piece('only-note', 'instrument_note');
    expect(selectAnalysisHero([only])).toEqual({ lead: only, more: [] });
  });

  it('leads with the newest weekly briefing even when notes are newer', () => {
    const note = piece('newest-note', 'instrument_note');
    const older = piece('older-weekly', 'weekly_briefing');
    const oldest = piece('oldest-weekly', 'weekly_briefing');
    const result = selectAnalysisHero([note, older, oldest]);
    expect(result?.lead).toBe(older);
    expect(result?.more).toEqual([note]);
  });

  it('falls back to the newest piece when there is no weekly briefing', () => {
    const explainer = piece('newest-explainer', 'explainer');
    const note = piece('older-note', 'instrument_note');
    const result = selectAnalysisHero([explainer, note]);
    expect(result?.lead).toBe(explainer);
    expect(result?.more).toEqual([note]);
  });

  it('shows at most three notes and explainers, newest first, never the lead', () => {
    const weekly = piece('weekly', 'weekly_briefing');
    const others = ['a', 'b', 'c', 'd'].map((id, index) =>
      piece(id, index % 2 ? 'explainer' : 'instrument_note'),
    );
    const extraWeekly = piece('earlier-weekly', 'weekly_briefing');
    const result = selectAnalysisHero([others[0], weekly, others[1], extraWeekly, others[2], others[3]]);
    expect(result?.lead).toBe(weekly);
    expect(result?.more).toEqual([others[0], others[1], others[2]]);
  });

  it('shows the pieces that exist when fewer than three remain', () => {
    const weekly = piece('weekly', 'weekly_briefing');
    const note = piece('note', 'instrument_note');
    expect(selectAnalysisHero([weekly, note])?.more).toEqual([note]);
  });
});
