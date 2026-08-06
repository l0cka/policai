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

export async function ingestSource(source: SourceRow, runStartedAt: string) {
  const pool = getPool();
  let found = 0;
  let inserted = 0;
  try {
    const raw: RawItem[] =
      source.fetch_method === 'rss'
        ? await fetchRss(source.url)
        : await fetchFirecrawl(source.url, source.item_link_pattern ?? '.+');
    found = raw.length;
    for (const item of raw) {
      const canonical = canonicalizeUrl(item.url);
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
    return { source_id: source.id, name: source.name, status: 'ok' as const, items_found: found, items_new: inserted, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `INSERT INTO ingest_runs (run_started_at, source_id, status, items_found, items_new, error)
       VALUES ($1, $2, 'failed', $3, $4, $5)`,
      [runStartedAt, source.id, found, inserted, message.slice(0, 1000)],
    );
    return { source_id: source.id, name: source.name, status: 'failed' as const, items_found: found, items_new: inserted, error: message };
  }
}

async function main() {
  const pool = getPool();
  const runStartedAt = new Date().toISOString();
  const { rows: sources } = await pool.query<SourceRow>(
    `SELECT id, name, url, fetch_method, item_link_pattern FROM sources WHERE active ORDER BY id`,
  );
  const results = [];
  for (const source of sources) results.push(await ingestSource(source, runStartedAt));
  console.log(JSON.stringify({ run_started_at: runStartedAt, sources: results }, null, 2));
  await closePool();
}

const isDirectRun = process.argv[1]?.endsWith('fetch-all.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
