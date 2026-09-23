import { getPool } from './db';
import { getUpcomingDeadlines } from './deadline-data';
import { getRadarPage, type RadarRow } from './radar-data';
import { WEEKLY_DEVELOPMENTS_SQL } from './weekly-query';

export type WeeklySignal = Pick<RadarRow, 'id' | 'title' | 'url' | 'blurb' | 'excerpt' | 'stream' | 'opportunity_reason' | 'published_at' | 'created_at' | 'source_name'>;

export async function getWeeklyBrief(asOf: Date) {
  const [opportunities, deadlines, developments] = await Promise.all([
    // Reuse the feed's public/relevance and open-opportunity semantics, with no
    // arbitrary age cutoff: an older grant can still be actionable today.
    getRadarPage({ page: 1, opp: '1' }),
    getUpcomingDeadlines(5),
    getPool().query<WeeklySignal & { total: number }>(WEEKLY_DEVELOPMENTS_SQL, [asOf.toISOString()]),
  ]);
  return { opportunities, deadlines, developments: developments.rows, totalDevelopments: developments.rows[0]?.total ?? 0 };
}
