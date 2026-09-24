// Shared by the server repository and the isolated SQL integration test.
// A rolling seven-day interval, not a calendar week. Both boundaries are explicit.
export const WEEKLY_DEVELOPMENTS_SQL = `
  SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream,
         i.opportunity_reason, i.published_at, i.created_at, s.name AS source_name,
         count(*) OVER()::int AS total
  FROM items i JOIN sources s ON s.id = i.source_id
  WHERE i.relevant
    AND coalesce(i.published_at, i.created_at) >= $1::timestamptz - interval '168 hours'
    AND coalesce(i.published_at, i.created_at) <= $1::timestamptz
  ORDER BY coalesce(i.published_at, i.created_at) DESC, i.id DESC
  LIMIT 12`;

/**
 * The collection anchor the weekly window is measured back from: the most
 * recent successful ingest run across all sources, matching the masthead
 * dateline. Collection, not the wall clock, decides how current the page is —
 * a stalled collector must not read as a quiet week.
 */
export const WEEKLY_ANCHOR_SQL = `
  SELECT max(created_at) AS anchor FROM ingest_runs WHERE status = 'ok'`;

/** The weekly window: the 168 hours before the anchor, bounds included. */
export function weekWindow(anchorMs: number): { startMs: number; endMs: number } {
  return { startMs: anchorMs - 168 * 3_600_000, endMs: anchorMs };
}

/** Stale when the anchor is itself more than a week old. */
export function isStaleSnapshot(anchorMs: number, nowMs: number): boolean {
  return nowMs - anchorMs > 7 * 86_400_000;
}
