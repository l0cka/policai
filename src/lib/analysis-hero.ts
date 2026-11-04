export interface AnalysisHeroSlideMeta {
  slug: string;
  title: string;
}

/** The hero shows only the latest few pieces; the rest are on /analysis. */
export const ANALYSIS_HERO_LIMIT = 5;

/** How long each article stays before the hero advances. */
export const ANALYSIS_HERO_INTERVAL_MS = 7000;

/**
 * Pieces the register hero moves through: the first ANALYSIS_HERO_LIMIT
 * published pieces in the order given (the analysis index order, newest first).
 */
export function analysisHeroSlides<T extends { status: string }>(articles: readonly T[]): T[] {
  return articles.filter((article) => article.status === 'published').slice(0, ANALYSIS_HERO_LIMIT);
}

/** Next or previous index, wrapping at either end. */
export function analysisHeroIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return ((current + delta) % count + count) % count;
}
