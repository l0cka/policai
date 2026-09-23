import { getPool } from './db';
import { OPEN_OPPORTUNITY_SQL } from './deadline-data';
import { RADAR_PAGE_SIZE, radarPage, type RadarState } from './radar-state';
import { withCleanTitles } from './display-title';
/*
 * One row per source x collection across the window. Every figure the diagram
 * states is derived from this aggregate rather than from the rows we happen to
 * draw, so the counts cannot drift away from the population the way they did
 * when they were window functions over a LIMITed row set.
 */
export type NetworkPair = {
  source_name: string;
  source_url: string;
  collection: string;
  n: number;
  opportunities: number;
};

/* The individual signals, used for the density band and the featured item. */
export type NetworkSignal = {
  id: string | number;
  title: string;
  url: string;
  stream: string | null;
  opportunity: boolean;
  published_at: string | Date | null;
  created_at: string | Date;
  source_name: string;
};

export type RadarRow = {
  id: number;
  title: string;
  url: string;
  blurb: string | null;
  excerpt: string | null;
  stream: string | null;
  opportunity: boolean;
  opportunity_open: boolean;
  opportunity_reason: string | null;
  published_at: string | Date | null;
  created_at: string | Date;
  source_name: string;
};

/** One parameterized predicate for count and rows: search never changes publication semantics. */
function radarWhere(state: RadarState) {
  const conditions = [state.filtered === '1' ? 'NOT i.relevant' : 'i.relevant'];
  const args: unknown[] = [];
  if (state.stream) {
    args.push(state.stream);
    conditions.push(`i.stream = $${args.length}`);
  }
  if (state.opp === '1') conditions.push(OPEN_OPPORTUNITY_SQL);
  if (state.q) {
    args.push(state.q);
    // The indexed item text and the displayed source name are both searchable.
    conditions.push(`(i.search @@ websearch_to_tsquery('english', $${args.length}) OR
      to_tsvector('english', s.name) @@ websearch_to_tsquery('english', $${args.length}))`);
  }
  return { where: `WHERE ${conditions.join(' AND ')}`, args };
}

export async function getRadarPage(state: RadarState) {
  const { where, args } = radarWhere(state);
  const pool = getPool();
  // SQL fragments above are code-owned; every visitor value is a query parameter.
  const { rows: counts } = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM items i JOIN sources s ON s.id = i.source_id ${where}`, args,
  );
  const pagination = radarPage(counts[0].total, state.page);
  const { rows } = await pool.query<RadarRow>(
    `SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream, i.opportunity, i.opportunity_reason,
            ${OPEN_OPPORTUNITY_SQL} AS opportunity_open,
            i.published_at, i.created_at, s.name AS source_name
     FROM items i JOIN sources s ON s.id = i.source_id
     ${where} ORDER BY coalesce(i.published_at, i.created_at) DESC, i.id DESC
     LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, RADAR_PAGE_SIZE, pagination.offset],
  );
  return { rows: withCleanTitles(rows), pagination };
}

export async function getRadarStats() {
  const { rows } = await getPool().query<{ new_week: number; opportunities: number; tracked: number }>(
    `SELECT count(*) FILTER (WHERE coalesce(i.published_at, i.created_at) >= now() - interval '7 days')::int AS new_week,
            count(*) FILTER (WHERE ${OPEN_OPPORTUNITY_SQL})::int AS opportunities,
            count(*)::int AS tracked FROM items i WHERE i.relevant`,
  );
  return rows[0];
}

export async function getRadarSourceStats() {
  const { rows } = await getPool().query<{ total: number; ok: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE last_status = 'ok')::int AS ok
     FROM (
       SELECT DISTINCT ON (s.id) s.id, r.status AS last_status
       FROM sources s LEFT JOIN ingest_runs r ON r.source_id = s.id
       WHERE s.active ORDER BY s.id, r.created_at DESC NULLS LAST
     ) latest`,
  );
  return rows[0];
}

/** Landing-page context is separate from the filtered archive and not loaded during research. */
export async function getRadarOverview() {
  const [{ rows: networkPairs }, { rows: networkSignals }, { rows: latestItems }] = await Promise.all([
    getPool().query<NetworkPair>(
      `SELECT s.name AS source_name, s.url AS source_url,
              coalesce(i.stream, 'unclassified') AS collection, count(*)::int AS n,
              count(*) FILTER (WHERE ${OPEN_OPPORTUNITY_SQL})::int AS opportunities
       FROM items i JOIN sources s ON s.id = i.source_id
       WHERE i.relevant AND coalesce(i.published_at, i.created_at) >= now() - interval '30 days'
       GROUP BY s.name, s.url, coalesce(i.stream, 'unclassified')`,
    ),
    getPool().query<NetworkSignal>(
      `SELECT i.id, i.title, i.url, i.stream, i.opportunity,
              i.published_at, i.created_at, s.name AS source_name
       FROM items i JOIN sources s ON s.id = i.source_id
       WHERE i.relevant AND coalesce(i.published_at, i.created_at) >= now() - interval '30 days'
       ORDER BY coalesce(i.published_at, i.created_at) DESC, i.id DESC LIMIT 2000`,
    ),
    getPool().query<RadarRow>(
      `SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream, i.opportunity, i.opportunity_reason,
              ${OPEN_OPPORTUNITY_SQL} AS opportunity_open,
              i.published_at, i.created_at, s.name AS source_name
       FROM items i JOIN sources s ON s.id = i.source_id
       WHERE i.relevant AND coalesce(i.published_at, i.created_at) >= now() - interval '30 days'
       ORDER BY coalesce(i.published_at, i.created_at) DESC, i.id DESC LIMIT 3`,
    ),
  ]);
  return {
    networkPairs,
    networkSignals: withCleanTitles(networkSignals),
    latestItems: withCleanTitles(latestItems),
  };
}
