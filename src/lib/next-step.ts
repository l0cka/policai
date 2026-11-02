import type { Follow } from '@/lib/follows';
import { getThemeLabel, type ThemeId } from '@/lib/themes';
import { getJurisdictionName, type Jurisdiction } from '@/types';

export interface LabelledFollow {
  follow: Follow;
  label: string;
}

export interface FollowableRecord {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  themes: readonly ThemeId[];
}

const THEME_FOLLOW_LIMIT = 2;

function jurisdictionFollow(id: Jurisdiction): LabelledFollow {
  return { follow: { kind: 'jurisdiction', id }, label: getJurisdictionName(id) };
}

function themeFollow(id: ThemeId): LabelledFollow {
  return { follow: { kind: 'theme', id }, label: getThemeLabel(id) };
}

/** The record itself, its jurisdiction, then its first themes. */
export function followsForRecord(record: FollowableRecord): LabelledFollow[] {
  return [
    { follow: { kind: 'policy', id: record.id }, label: 'this record' },
    jurisdictionFollow(record.jurisdiction),
    ...record.themes.slice(0, THEME_FOLLOW_LIMIT).map(themeFollow),
  ];
}

function mostCommon<T>(values: readonly T[]): T[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  // Map keeps first-seen order, and sort is stable, so ties keep citation order.
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}

/** The jurisdiction and themes that the cited records share most. */
export function followsForCitedRecords(records: readonly FollowableRecord[]): LabelledFollow[] {
  const [jurisdiction] = mostCommon(records.map((record) => record.jurisdiction));
  if (jurisdiction === undefined) return [];
  return [
    jurisdictionFollow(jurisdiction),
    ...mostCommon(records.flatMap((record) => record.themes)).slice(0, THEME_FOLLOW_LIMIT).map(themeFollow),
  ];
}

export interface ArticleLink {
  slug: string;
  cites: readonly string[];
  publishedAt: string;
}

export const MORE_ANALYSIS_LIMIT = 3;

/**
 * Other published pieces: those citing more of the same records first,
 * then the newest. `sharedCites` is 0 for a piece that shares none.
 */
export function moreAnalysis<T extends ArticleLink>(
  current: ArticleLink,
  articles: readonly T[],
): Array<T & { sharedCites: number }> {
  const cited = new Set(current.cites);
  return articles
    .filter((article) => article.slug !== current.slug)
    .map((article) => ({ ...article, sharedCites: article.cites.filter((id) => cited.has(id)).length }))
    .sort(
      (a, b) =>
        b.sharedCites - a.sharedCites ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.slug.localeCompare(b.slug),
    )
    .slice(0, MORE_ANALYSIS_LIMIT);
}
