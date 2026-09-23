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
