import { createHash } from 'node:crypto';
import { canonicalizeUrl } from './lib/canonical.js';
import { closePool, getPool } from './lib/db.js';
import { fetchFirecrawl, type RawItem } from './lib/fetch-firecrawl.js';
import { fetchRss } from './lib/fetch-rss.js';

type SourceRow = {
  id: number;
  name: string;
  url: string;
  fetch_method: 'rss' | 'firecrawl';
  item_link_pattern: string | null;
};

type Fetcher = (source: SourceRow) => Promise<RawItem[]>;

type Counts = { source_id: number; name: string; items_found: number; items_new: number };

export type SourceOutcome =
  | (Counts & { status: 'ok'; error: null })
  | (Counts & { status: 'failed'; cause: 'fetch' | 'database'; error: string });

export function exitCode(outcomes: SourceOutcome[]): 0 | 1 {
  if (outcomes.some((o) => o.status === 'failed' && o.cause === 'database')) return 1;
  if (outcomes.length > 0 && outcomes.every((o) => o.status === 'failed')) return 1;
  return 0;
}

function tryCanonicalize(url: string): string | null {
  try {
    return canonicalizeUrl(url);
  } catch (err) {
    if (err instanceof TypeError) return null;
    throw err;
  }
}

export async function ingestSource(
  source: SourceRow,
  runStartedAt: string,
  fetcher?: Fetcher,
): Promise<SourceOutcome> {
  const pool = getPool();
  let found = 0;
  let inserted = 0;
  let cause: 'fetch' | 'database' = 'fetch';
  try {
    let raw: RawItem[];
    if (fetcher) raw = await fetcher(source);
    else if (source.fetch_method === 'rss') raw = await fetchRss(source.url);
    else raw = await fetchFirecrawl(source.url, source.item_link_pattern ?? '.+');
    found = raw.length;
    cause = 'database';
    for (const item of raw) {
      const canonical = tryCanonicalize(item.url);
      if (canonical === null) continue;
      const hash = item.excerpt
        ? createHash('sha256').update(item.title + item.excerpt).digest('hex')
        : null;
      const res = await pool.query(
        `INSERT INTO items (source_id, url, canonical_url, title, published_at, excerpt, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [source.id, item.url, canonical, item.title, item.published_at, item.excerpt, hash],
      );
      inserted += res.rowCount ?? 0;
    }
    await pool.query(
      `INSERT INTO ingest_runs (run_started_at, source_id, status, items_found, items_new)
       VALUES ($1, $2, 'ok', $3, $4)`,
      [runStartedAt, source.id, found, inserted],
    );
    return { source_id: source.id, name: source.name, status: 'ok', items_found: found, items_new: inserted, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `INSERT INTO ingest_runs (run_started_at, source_id, status, items_found, items_new, error)
       VALUES ($1, $2, 'failed', $3, $4, $5)`,
      [runStartedAt, source.id, found, inserted, message.slice(0, 1000)],
    );
    return { source_id: source.id, name: source.name, status: 'failed', cause, items_found: found, items_new: inserted, error: message };
  }
}

async function main(): Promise<0 | 1> {
  const pool = getPool();
  const runStartedAt = new Date().toISOString();
  const { rows: sources } = await pool.query<SourceRow>(
    `SELECT id, name, url, fetch_method, item_link_pattern FROM sources WHERE active ORDER BY id`,
  );
  const results: SourceOutcome[] = [];
  for (const source of sources) results.push(await ingestSource(source, runStartedAt));
  console.log(JSON.stringify({ run_started_at: runStartedAt, sources: results }, null, 2));
  await closePool();
  return exitCode(results);
}

const isDirectRun = process.argv[1]?.endsWith('fetch-all.ts');
if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
