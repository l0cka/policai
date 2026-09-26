/*
 * Health aggregates shared by /health, the landing-page rail and /api/status.
 * All figures come from one SQL definition (SOURCE_HEALTH_SQL), so a page and
 * the JSON endpoint cannot drift apart, and unit tests can assert on the rows
 * without a database. The pool is passed in by each caller (the db module is
 * a runtime dependency, not an import), which also keeps this module
 * import-free for the Node strip-types test runner.
 */

/**
 * Days after which a source with no successful run counts as overdue.
 * The collector runs daily (ops/probono-ingest.timer, 06:00 Sydney), so the
 * limit is a nominal daily cadence plus slack for one missed run.
 */
export const SOURCE_OVERDUE_DAYS = 3;

/** Minimal query surface of the pg pool, so tests can pass a stand-in. */
export type Queryable = {
  query: <R extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: R[] }>;
};

/** `retired`: deactivated on purpose (dead, blocked, or terms forbid it). */
export type SourceHealthState = 'ok' | 'overdue' | 'failed' | 'never' | 'retired';

export type SourceHealthRow = {
  id: number;
  name: string;
  fetch_method: string;
  active: boolean;
  /** Status of the most recent run, or null when the source has never run. */
  last_status: string | null;
  /** Time of the most recent successful run, or null when there has been none. */
  last_ok_at: string | Date | null;
  /** Time of the most recent run of any status, or null when none exists. */
  next_run_at: string | Date | null;
  items_found: number | null;
  items_new: number | null;
  error: string | null;
};

/**
 * One row per source with the columns every health view needs. No cadence
 * column exists on sources, so "overdue" is a fixed threshold on the last
 * successful run rather than a per-source schedule.
 */
export const SOURCE_HEALTH_SQL = `
  SELECT s.id, s.name, s.fetch_method, s.active, r.status AS last_status,
         (SELECT r2.created_at FROM ingest_runs r2
          WHERE r2.source_id = s.id AND r2.status = 'ok'
          ORDER BY r2.created_at DESC LIMIT 1) AS last_ok_at,
         r.created_at AS next_run_at,
         r.items_found, r.items_new, r.error
  FROM sources s LEFT JOIN LATERAL (
    SELECT * FROM ingest_runs r3 WHERE r3.source_id = s.id
    ORDER BY r3.created_at DESC LIMIT 1
  ) r ON TRUE`;

/**
 * The health state a source is shown in, from its latest run and the last
 * successful run. A source whose latest run failed stays "failed" even when an
 * earlier run succeeded — the reader needs the error first — but an older
 * successful run inside the threshold keeps it out of the overdue count.
 */
export function sourceHealthState(
  row: Pick<SourceHealthRow, 'active' | 'last_status' | 'last_ok_at'>,
  now: Date = new Date(),
): SourceHealthState {
  if (!row.active) return 'retired';
  if (row.last_status === 'failed') return 'failed';
  if (!row.last_ok_at) return 'never';
  const lastOk = new Date(row.last_ok_at).getTime();
  if (Number.isNaN(lastOk)) return 'never';
  return now.getTime() - lastOk > SOURCE_OVERDUE_DAYS * 86_400_000 ? 'overdue' : 'ok';
}

const STATE_LABELS: Record<SourceHealthState, string> = {
  ok: 'OK',
  overdue: 'Overdue',
  failed: 'Failed',
  never: 'Never run',
  retired: 'Retired',
};

export function sourceHealthLabel(state: SourceHealthState): string {
  return STATE_LABELS[state];
}

/**
 * Public label for a source's fetch method. The stored value names the
 * retrieval tool; the page describes the kind of retrieval instead.
 */
const FETCH_METHOD_LABELS: Record<string, string> = {
  rss: 'Feed',
  firecrawl: 'Web page',
};

export function fetchMethodLabel(method: string): string {
  return FETCH_METHOD_LABELS[method] ?? 'Other';
}

/**
 * A source's last error as shown on /health. Stored errors name the
 * retrieval tool; the page names the kind of retrieval instead.
 */
export function sourceErrorLabel(error: string | null): string {
  if (!error) return '';
  return error
    .replace(/\bfirecrawl returned no markdown\b/gi, 'page fetch returned no text')
    .replace(/\bfirecrawl\b/gi, 'page fetch')
    .slice(0, 160);
}

export type SourceHealthSummary = {
  total: number;
  ok: number;
  overdue: number;
  failed: number;
  never: number;
  reporting: number;
};

/**
 * Counts from health rows, for the stat strip and /api/status. "Reporting"
 * counts every source whose last run succeeded and is not overdue, matching
 * the "All sources reporting" chip on the landing page.
 */
export function summarizeSourceHealth(
  rows: readonly Pick<SourceHealthRow, 'active' | 'last_status' | 'last_ok_at'>[],
  now: Date = new Date(),
): SourceHealthSummary {
  const active = rows.filter((row) => row.active);
  const states = active.map((row) => sourceHealthState(row, now));
  const ok = states.filter((state) => state === 'ok').length;
  const overdue = states.filter((state) => state === 'overdue').length;
  const failed = states.filter((state) => state === 'failed').length;
  const never = states.filter((state) => state === 'never').length;
  return { total: active.length, ok, overdue, failed, never, reporting: ok };
}

/**
 * Sources and their health, ordered the way /health lists them: failures
 * first, then sources that have never run, then overdue, then the rest, with
 * retired sources last; by name within each group.
 */
export async function getSourceHealth(db: Queryable): Promise<SourceHealthRow[]> {
  const { rows } = await db.query<SourceHealthRow>(SOURCE_HEALTH_SQL);
  const order: Record<SourceHealthState, number> = { failed: 0, never: 1, overdue: 2, ok: 3, retired: 4 };
  return rows.sort(
    (a, b) =>
      order[sourceHealthState(a)] - order[sourceHealthState(b)] ||
      String(a.name).localeCompare(String(b.name), 'en-AU'),
  );
}

/**
 * The rail figure for the landing page: per-source totals over active
 * sources, one aggregate query rather than shipping every row to the page.
 */
export async function getRadarSourceStats(db: Queryable) {
  const { rows } = await db.query<{
    total: number;
    ok: number;
    overdue: number;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE state = 'ok')::int AS ok,
            count(*) FILTER (WHERE state = 'overdue')::int AS overdue
     FROM (
       SELECT s.id,
              CASE
                WHEN r.status = 'failed' THEN 'failed'
                WHEN ok_run.last_ok_at IS NULL THEN 'never'
                WHEN ok_run.last_ok_at < now() - interval '${SOURCE_OVERDUE_DAYS} days' THEN 'overdue'
                ELSE 'ok'
              END AS state
       FROM sources s
       LEFT JOIN LATERAL (
         SELECT * FROM ingest_runs r3 WHERE r3.source_id = s.id
         ORDER BY r3.created_at DESC LIMIT 1
       ) r ON TRUE
       LEFT JOIN LATERAL (
         SELECT max(r2.created_at) AS last_ok_at FROM ingest_runs r2
         WHERE r2.source_id = s.id AND r2.status = 'ok'
       ) ok_run ON TRUE
       WHERE s.active
     ) latest`,
  );
  return rows[0];
}

/**
 * When collection last completed any run successfully, across all sources.
 * The same anchor the masthead dateline uses.
 */
export async function getLastHealthyAt(db: Queryable): Promise<string | null> {
  const { rows } = await db.query<{ at: string | Date | null }>(
    `SELECT max(created_at) AS at FROM ingest_runs WHERE status = 'ok'`,
  );
  return rows[0]?.at ? new Date(rows[0].at).toISOString() : null;
}

/*
 * Record completeness over items. The expected fields follow the register's
 * coverage report (src/lib/coverage-report.ts), adapted to what a radar item
 * carries: stream, blurb, excerpt, published_at and a well-formed entities
 * deadlines array. One parameterized query with count(*) FILTER per field, so
 * every gap is measured against the same population.
 */

export type ItemExpectedField = 'stream' | 'blurb' | 'excerpt' | 'published_at' | 'deadlines';

export const ITEM_EXPECTED_FIELDS: readonly ItemExpectedField[] = [
  'stream',
  'blurb',
  'excerpt',
  'published_at',
  'deadlines',
];

export const ITEM_EXPECTED_FIELD_LABELS: Record<ItemExpectedField, string> = {
  stream: 'Collection (stream)',
  blurb: 'Display blurb',
  excerpt: 'Excerpt',
  published_at: 'Publication date',
  deadlines: 'Well-formed deadlines array',
};

/**
 * Completeness measures the records that exist, not how much of the sector
 * the radar covers: relevant items already collected, not the sector's whole
 * output. Counts are computed by Postgres, so a page and the JSON endpoint
 * read one population.
 */
export async function getItemCompleteness(db: Queryable) {
  const { rows } = await db.query<{
    total: number;
    missing_stream: number;
    missing_blurb: number;
    missing_excerpt: number;
    missing_published_at: number;
    missing_deadlines: number;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE i.stream IS NULL)::int AS missing_stream,
            count(*) FILTER (WHERE coalesce(btrim(i.blurb), '') = '')::int AS missing_blurb,
            count(*) FILTER (WHERE coalesce(btrim(i.excerpt), '') = '')::int AS missing_excerpt,
            count(*) FILTER (WHERE i.published_at IS NULL)::int AS missing_published_at,
            count(*) FILTER (WHERE NOT COALESCE(
              jsonb_typeof(i.entities->'deadlines') = 'array'
              AND (SELECT bool_and(coalesce(jsonb_typeof(d), 'null') = 'object' AND d ? 'date')
                   FROM jsonb_array_elements(i.entities->'deadlines') d),
              false))::int AS missing_deadlines
     FROM items i WHERE i.relevant`,
  );
  const row = rows[0];
  const { total, ...missing } = row;
  return {
    total,
    missing,
    complete: total - ITEM_EXPECTED_FIELDS.filter((field) => missing[`missing_${field}`] > 0).length,
  };
}