import type { PublishedArticle } from '@/types';

export const HERO_MORE_LIMIT = 3;

export interface AnalysisHero<T extends PublishedArticle> {
  lead: T;
  more: T[];
}

export function selectAnalysisHero<T extends PublishedArticle>(
  articles: T[],
): AnalysisHero<T> | null {
  const lead =
    articles.find((article) => article.type === 'weekly_briefing') ?? articles[0];
  if (!lead) return null;
  const more = articles
    .filter(
      (article) =>
        article !== lead &&
        (article.type === 'instrument_note' || article.type === 'explainer'),
    )
    .slice(0, HERO_MORE_LIMIT);
  return { lead, more };
}
