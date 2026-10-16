import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';

const DB = process.env.DATABASE_URL;
const describeWithDatabase = DB ? describe : describe.skip;

describeWithDatabase('save-enrichment rejection (integration)', () => {
  let itemId: number;

  beforeAll(async () => {
    const pool = getPool();
    const { rows: src } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('fixture-reject', 'https://fixture-reject.test', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'fixture-reject' RETURNING id`,
    );
    const { rows } = await pool.query(
      `INSERT INTO items (source_id, url, canonical_url, title)
       VALUES ($1, 'https://fixture-reject.test/a', 'https://fixture-reject.test/a', 'Reject me')
       ON CONFLICT (canonical_url) DO UPDATE SET enriched_at = NULL, relevant = true, blurb = NULL RETURNING id`,
      [src[0].id],
    );
    itemId = rows[0].id;
  });

  afterAll(async () => closePool());

  it('marks a rejected item screened out with the reason, so it leaves the queue', async () => {
    const result = spawnSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
      cwd: new URL('..', import.meta.url).pathname,
      input: JSON.stringify({ stream: 'sport' }),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: DB },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/validation failed/);
    const { rows } = await getPool().query(
      `SELECT relevant, enriched_at, blurb FROM items WHERE id = $1`,
      [itemId],
    );
    expect(rows[0].relevant).toBe(false);
    expect(rows[0].enriched_at).not.toBeNull();
    expect(rows[0].blurb).toMatch(/^Enrichment rejected: /);
  });

  it('does not overwrite an enrichment that already landed', async () => {
    const result = spawnSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
      cwd: new URL('..', import.meta.url).pathname,
      input: 'not valid json {',
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: DB },
    });
    expect(result.status).toBe(2);
    const { rows } = await getPool().query(`SELECT blurb FROM items WHERE id = $1`, [itemId]);
    expect(rows[0].blurb).toMatch(/validation failed/);
  });
});
