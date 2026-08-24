import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestSource } from '../src/fetch-all.js';
import { closePool, getPool } from '../src/lib/db.js';
import { parseRssString } from '../src/lib/fetch-rss.js';
import { canonicalizeUrl } from '../src/lib/canonical.js';
import type { RawItem } from '../src/lib/fetch-firecrawl.js';

// Requires: docker compose up -d db && schema applied.
// DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('ingest pipeline (integration)', () => {
  let sourceId: number;
  let badSourceId: number;

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM ingest_runs; DELETE FROM item_tags; DELETE FROM items;`);
    const { rows: sourceRows } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('fixture', 'https://fixture.test/feed', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'fixture' RETURNING id`,
    );
    sourceId = sourceRows[0].id;

    const { rows: badRows } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('bad-feed', 'https://unreachable.test/feed', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'bad-feed' RETURNING id`,
    );
    badSourceId = badRows[0].id;
  });

  afterAll(async () => closePool());

  it('parses the RSS fixture into RawItems', async () => {
    const xml = readFileSync(new URL('./fixtures/probono-australia.rss.xml', import.meta.url), 'utf8');
    const items = await parseRssString(xml);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('New NLAP funding round announced');
    expect(items[0].excerpt).toContain('top-up round');
  });

  it('falls back to guid when the feed link is a malformed domainless URL', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item>
        <title>Allens: Upholding the right to personal liberty</title>
        <link>http://voco-11-allens-detention?utm_source=rss</link>
        <guid isPermaLink="false">https://www.probonocentre.org.au/?p=28047</guid>
      </item>
      <item>
        <title>Working link wins over guid</title>
        <link>https://www.probonocentre.org.au/real-post/</link>
        <guid isPermaLink="false">https://www.probonocentre.org.au/?p=99</guid>
      </item>
    </channel></rss>`;
    const items = await parseRssString(xml);
    expect(items.map((i) => i.url)).toEqual([
      'https://www.probonocentre.org.au/?p=28047',
      'https://www.probonocentre.org.au/real-post/',
    ]);
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

  it('ingestSource success path: fetches items, inserts, logs ok run', async () => {
    const pool = getPool();
    const runStartedAt = new Date().toISOString();
    const mockFetcher = async () => [
      { url: 'https://example.com/news/1', title: 'Item 1', published_at: '2026-08-07T00:00:00Z', excerpt: 'Excerpt 1' },
      { url: 'https://example.com/news/2', title: 'Item 2', published_at: '2026-08-07T01:00:00Z', excerpt: 'Excerpt 2' },
    ] as RawItem[];

    const result = await ingestSource(
      { id: sourceId, name: 'fixture', url: 'https://fixture.test/feed', fetch_method: 'rss', item_link_pattern: null },
      runStartedAt,
      mockFetcher,
    );

    expect(result.status).toBe('ok');
    expect(result.items_found).toBe(2);
    expect(result.items_new).toBe(2);
    expect(result.error).toBeNull();

    // Verify ingest_runs row was logged
    const { rows: runRows } = await pool.query(
      `SELECT status, items_found, items_new FROM ingest_runs WHERE run_started_at = $1 AND source_id = $2`,
      [runStartedAt, sourceId],
    );
    expect(runRows).toHaveLength(1);
    expect(runRows[0].status).toBe('ok');
    expect(runRows[0].items_found).toBe(2);
    expect(runRows[0].items_new).toBe(2);
  });

  it('ingestSource failure path: fetch fails, returns failed status with error, does not throw', async () => {
    const pool = getPool();
    const runStartedAt = new Date().toISOString();
    const mockFetcher = async () => {
      throw new Error('Feed unreachable');
    };

    const result = await ingestSource(
      { id: badSourceId, name: 'bad-feed', url: 'https://unreachable.test/feed', fetch_method: 'rss', item_link_pattern: null },
      runStartedAt,
      mockFetcher,
    );

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Feed unreachable');
    expect(result.items_found).toBe(0);

    // Verify ingest_runs row was logged with 'failed' status
    const { rows: runRows } = await pool.query(
      `SELECT status, error FROM ingest_runs WHERE run_started_at = $1 AND source_id = $2`,
      [runStartedAt, badSourceId],
    );
    expect(runRows).toHaveLength(1);
    expect(runRows[0].status).toBe('failed');
    expect(runRows[0].error).toBe('Feed unreachable');
  });

  it('ingestSource with mixed good/bad items: skips bad items, inserts good ones, reports ok', async () => {
    const pool = getPool();
    const runStartedAt = new Date().toISOString();
    const mockFetcher = async () => [
      { url: 'https://example.com/news/good1', title: 'Good 1', published_at: '2026-08-07T00:00:00Z', excerpt: 'Good excerpt 1' },
      { url: 'not-a-url-will-throw', title: 'Bad Item', published_at: '2026-08-07T01:00:00Z', excerpt: 'Bad URL' },
      { url: 'https://example.com/news/good2', title: 'Good 2', published_at: '2026-08-07T02:00:00Z', excerpt: 'Good excerpt 2' },
    ] as RawItem[];

    const result = await ingestSource(
      { id: sourceId, name: 'fixture', url: 'https://fixture.test/feed', fetch_method: 'rss', item_link_pattern: null },
      runStartedAt,
      mockFetcher,
    );

    expect(result.status).toBe('ok');
    expect(result.items_found).toBe(3); // all 3 fetched
    expect(result.items_new).toBe(2); // only 2 inserted (bad item skipped)

    // Verify ingest_runs row logged ok with correct counts
    const { rows: runRows } = await pool.query(
      `SELECT status, items_found, items_new FROM ingest_runs WHERE run_started_at = $1 AND source_id = $2 ORDER BY id DESC LIMIT 1`,
      [runStartedAt, sourceId],
    );
    expect(runRows).toHaveLength(1);
    expect(runRows[0].status).toBe('ok');
    expect(runRows[0].items_found).toBe(3);
    expect(runRows[0].items_new).toBe(2);
  });
});
