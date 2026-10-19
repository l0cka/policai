import { describe, expect, it } from 'vitest';
import { analysisHeroIndex, analysisHeroSlides } from '@/lib/analysis-hero';
import type { Article, ArticleType, PublishedArticle } from '@/types';

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

describe('analysisHeroSlides', () => {
  it('keeps published pieces in the order given', () => {
    const note = piece('note', 'instrument_note');
    const weekly = piece('weekly', 'weekly_briefing');
    expect(analysisHeroSlides([note, weekly])).toEqual([note, weekly]);
  });

  it('returns an empty list when there are no pieces', () => {
    expect(analysisHeroSlides([])).toEqual([]);
  });

  it('drops drafts and withdrawn pieces', () => {
    const published = piece('published', 'instrument_note');
    const draft = { ...piece('draft', 'explainer'), status: 'draft' } as Article;
    const withdrawn = { ...piece('withdrawn', 'instrument_note'), status: 'withdrawn' } as Article;
    expect(analysisHeroSlides([draft, published, withdrawn])).toEqual([published]);
  });
});

describe('analysisHeroIndex', () => {
  it('wraps forward and back', () => {
    expect(analysisHeroIndex(0, 1, 3)).toBe(1);
    expect(analysisHeroIndex(2, 1, 3)).toBe(0);
    expect(analysisHeroIndex(0, -1, 3)).toBe(2);
  });

  it('stays at zero when there is nothing to show', () => {
    expect(analysisHeroIndex(4, 1, 0)).toBe(0);
  });
});
