import { getPool } from './db';
import { getUpcomingDeadlines } from './deadline-data';
import { getRadarPage, type RadarRow } from './radar-data';
import { WEEKLY_ANCHOR_SQL, WEEKLY_DEVELOPMENTS_SQL } from './weekly-query';
import { withCleanTitles } from './display-title';

export type WeeklySignal = Pick<RadarRow, 'id' | 'title' | 'url' | 'blurb' | 'excerpt' | 'stream' | 'opportunity_reason' | 'published_at' | 'created_at' | 'source_name'>;

export async function getWeeklyBrief(asOf: Date) {
  const [opportunities, deadlines, anchor, developments] = await Promise.all([
    // Reuse the feed's public/relevance and open-opportunity semantics, with no
    // arbitrary age cutoff: an older grant can still be actionable today.
    getRadarPage({ page: 1, opp: '1' }),
    getUpcomingDeadlines(5),
    getPool().query<{ anchor: string | Date | null }>(WEEKLY_ANCHOR_SQL),
    getPool().query<WeeklySignal & { total: number }>(WEEKLY_DEVELOPMENTS_SQL, [asOf.toISOString()]),
  ]);
  return {
    opportunities,
    deadlines,
    // The week window follows collection, not the wall clock; null when no
    // run has ever succeeded, so the page can say so instead of inventing a
    // window.
    anchor: anchor.rows[0]?.anchor ? new Date(anchor.rows[0].anchor) : null,
    developments: withCleanTitles(developments.rows),
    totalDevelopments: developments.rows[0]?.total ?? 0,
  };
}
