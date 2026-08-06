import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';
import { parseRssString } from '../src/lib/fetch-rss.js';
import { canonicalizeUrl } from '../src/lib/canonical.js';

// Requires: docker compose up -d db && schema applied.
// DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar

describe('ingest pipeline (integration)', () => {
  let sourceId: number;

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM ingest_runs; DELETE FROM item_tags; DELETE FROM items;`);
    const { rows } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('fixture', 'https://fixture.test/feed', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'fixture' RETURNING id`,
    );
    sourceId = rows[0].id;
  });

  afterAll(async () => closePool());

  it('parses the RSS fixture into RawItems', async () => {
    const xml = readFileSync(new URL('./fixtures/probono-australia.rss.xml', import.meta.url), 'utf8');
    const items = await parseRssString(xml);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('New NLAP funding round announced');
    expect(items[0].excerpt).toContain('top-up round');
  });

  it('dedupes on canonical_url via ON CONFLICT DO NOTHING', async () => {
    const pool = getPool();
    const canonical = canonicalizeUrl('https://fixture.test/news/one/?utm_source=rss');
    const insert = (url: string) =>
      pool.query(
        `INSERT INTO items (source_id, url, canonical_url, title) VALUES ($1, $2, $3, 'One')
         ON CONFLICT DO NOTHING`,
        [sourceId, url, canonical],
      );
    const first = await insert('https://fixture.test/news/one/?utm_source=rss');
    const second = await insert('https://fixture.test/news/one/');
    expect(first.rowCount).toBe(1);
    expect(second.rowCount).toBe(0);
  });
});
