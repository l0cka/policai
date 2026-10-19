import type { RelatedInstrument } from '@/lib/related-policies';
import { relatedInstruments } from '@/lib/related-policies';
import type { Policy, PublishedArticle } from '@/types';

export const COURT_RELATED_VISIBLE_LIMIT = 4;

export interface CourtAnalysisLink {
  slug: string;
  title: string;
  type: PublishedArticle['type'];
  publishedAt: string;
  summary: string;
  courtCiteCount: number;
}

/** Published pieces that cite at least one court practice note, densest first. */
export function courtFocusedAnalyses(
  articles: PublishedArticle[],
  courtIds: ReadonlySet<string>,
): CourtAnalysisLink[] {
  return articles
    .map((article) => ({
      slug: article.slug,
      title: article.title,
      type: article.type,
      publishedAt: article.publishedAt,
      summary: article.summary,
      courtCiteCount: article.cites.filter((id) => courtIds.has(id)).length,
    }))
    .filter((article) => article.courtCiteCount > 0)
    .sort(
      (a, b) =>
        b.courtCiteCount - a.courtCiteCount ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.slug.localeCompare(b.slug),
    );
}

/** Map each court instrument id to the published pieces that cite it. */
export function analysesByCourtPolicy(
  articles: PublishedArticle[],
  courtIds: ReadonlySet<string>,
): Record<string, CourtAnalysisLink[]> {
  const byId: Record<string, CourtAnalysisLink[]> = {};
  for (const id of courtIds) byId[id] = [];

  for (const article of articles) {
    const citedCourtIds = article.cites.filter((id) => courtIds.has(id));
    if (citedCourtIds.length === 0) continue;
    const link: CourtAnalysisLink = {
      slug: article.slug,
      title: article.title,
      type: article.type,
      publishedAt: article.publishedAt,
      summary: article.summary,
      courtCiteCount: citedCourtIds.length,
    };
    for (const id of citedCourtIds) {
      byId[id].push(link);
    }
  }

  for (const id of Object.keys(byId)) {
    byId[id].sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.slug.localeCompare(b.slug),
    );
  }
  return byId;
}

/**
 * Related instruments for the courts lane: same network ranking as policy
 * pages, but practice notes first and capped for the accordion.
 */
export function courtLaneRelated(
  policy: Policy,
  publicPolicies: Policy[],
  limit = COURT_RELATED_VISIBLE_LIMIT,
): RelatedInstrument[] {
  const items = relatedInstruments(policy, publicPolicies);
  const practiceNotes = items.filter((item) => item.type === 'practice_note');
  const others = items.filter((item) => item.type !== 'practice_note');
  return [...practiceNotes, ...others].slice(0, limit);
}

export function relatedByCourtPolicy(
  courtPolicies: Policy[],
  publicPolicies: Policy[],
  limit = COURT_RELATED_VISIBLE_LIMIT,
): Record<string, RelatedInstrument[]> {
  const byId: Record<string, RelatedInstrument[]> = {};
  for (const policy of courtPolicies) {
    byId[policy.id] = courtLaneRelated(policy, publicPolicies, limit);
  }
  return byId;
}
