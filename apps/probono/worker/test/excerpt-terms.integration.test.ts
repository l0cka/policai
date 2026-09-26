import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';
import { ingestSource } from '../src/fetch-all.js';

const DB = process.env.DATABASE_URL;
const describeWithDatabase = DB ? describe : describe.skip;

// Sources whose terms forbid reproduction keep headline, link and date only.
// The database enforces it, so every write path is covered: the listing/RSS
// insert and the enrichment agent's update.
describeWithDatabase('excerpt terms trigger (integration)', () => {
  let blockedId: number;
  let openId: number;

  beforeAll(async () => {
    const pool = getPool();
    const { rows: b } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method, allow_excerpt)
       VALUES ('terms-blocked', 'https://terms-blocked.test/news', 'firecrawl', false)
       ON CONFLICT (url) DO UPDATE SET allow_excerpt = false RETURNING id`,
    );
    const { rows: o } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method)
       VALUES ('terms-open', 'https://terms-open.test/feed', 'rss')
       ON CONFLICT (url) DO UPDATE SET allow_excerpt = true RETURNING id`,
    );
    blockedId = b[0].id;
    openId = o[0].id;
    await pool.query(`DELETE FROM items WHERE source_id IN ($1, $2)`, [blockedId, openId]);
  });

  afterAll(async () => closePool());

  const item = (host: string, n: number) => ({
    url: `https://${host}/a${n}`,
    title: `Item ${n} from ${host}`,
    published_at: null,
    excerpt: 'Opening text of the article.',
  });

  it('drops the excerpt on ingest for a restricted source and keeps it otherwise', async () => {
    const run = new Date().toISOString();
    const base = { item_link_pattern: null };
    await ingestSource({ id: blockedId, name: 'terms-blocked', url: 'https://terms-blocked.test/news', fetch_method: 'firecrawl', ...base }, run, async () => [item('terms-blocked.test', 1)]);
    await ingestSource({ id: openId, name: 'terms-open', url: 'https://terms-open.test/feed', fetch_method: 'rss', ...base }, run, async () => [item('terms-open.test', 1)]);
    const { rows } = await getPool().query(
      `SELECT source_id, title, excerpt FROM items WHERE source_id IN ($1, $2)`, [blockedId, openId],
    );
    const bySource = Object.fromEntries(rows.map((r) => [r.source_id, r]));
    expect(bySource[blockedId].title).toBe('Item 1 from terms-blocked.test');
    expect(bySource[blockedId].excerpt).toBeNull();
    expect(bySource[openId].excerpt).toBe('Opening text of the article.');
  });

  it('drops an excerpt written later by enrichment', async () => {
    const pool = getPool();
    await pool.query(`UPDATE items SET excerpt = 'Agent-copied text.' WHERE source_id = $1`, [blockedId]);
    const { rows } = await pool.query(`SELECT excerpt FROM items WHERE source_id = $1`, [blockedId]);
    expect(rows[0].excerpt).toBeNull();
  });
});
