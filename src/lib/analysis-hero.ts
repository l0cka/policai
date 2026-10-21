export interface AnalysisHeroSlideMeta {
  slug: string;
  title: string;
}

/** How long each article stays before the hero advances. */
export const ANALYSIS_HERO_INTERVAL_MS = 7000;

/**
 * Pieces the register hero moves through, in the order given (the analysis
 * index order). Drafts and withdrawn pieces are left out.
 */
export function analysisHeroSlides<T extends { status: string }>(articles: readonly T[]): T[] {
  return articles.filter((article) => article.status === 'published');
}

/** Next or previous index, wrapping at either end. */
export function analysisHeroIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return ((current + delta) % count + count) % count;
}
