import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';

const DB = process.env.DATABASE_URL;
const describeWithDatabase = DB ? describe : describe.skip;

describeWithDatabase('save-enrichment CLI (integration)', () => {
  let itemId: number;

  beforeAll(async () => {
    const pool = getPool();
    const { rows: src } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('fixture2', 'https://fixture2.test', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'fixture2' RETURNING id`,
    );
    const { rows } = await pool.query(
      `INSERT INTO items (source_id, url, canonical_url, title)
       VALUES ($1, 'https://fixture2.test/a', 'https://fixture2.test/a', 'Enrich me')
       ON CONFLICT (canonical_url) DO UPDATE SET title = 'Enrich me' RETURNING id`,
      [src[0].id],
    );
    itemId = rows[0].id;
  });

  afterAll(async () => closePool());

  it('saves a valid payload and stamps enriched_at', async () => {
    const payload = JSON.stringify({
      stream: 'tech_justice',
      relevant: true,
      blurb: 'A court digitisation pilot expands to two more registries this quarter.',
      opportunity: false,
      opportunity_reason: null,
      entities: { organisations: ['Federal Court'], deadlines: [], amounts: [] },
      excerpt: 'Pilot expands to two more registries.',
    });
    execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
      cwd: new URL('..', import.meta.url).pathname, input: payload,
      env: { ...process.env, DATABASE_URL: DB },
    });
    const { rows } = await getPool().query(`SELECT stream, relevant, enriched_at FROM items WHERE id = $1`, [itemId]);
    expect(rows[0].stream).toBe('tech_justice');
    expect(rows[0].relevant).toBe(true);
    expect(rows[0].enriched_at).not.toBeNull();
  });

  it('persists relevant=false for screened-out items', async () => {
    const payload = JSON.stringify({
      stream: 'news',
      relevant: false,
      blurb: 'Practitioner profile piece; no bearing on sector developments.',
      opportunity: false,
      opportunity_reason: null,
      entities: { organisations: [], deadlines: [], amounts: [] },
      excerpt: null,
    });
    execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
      cwd: new URL('..', import.meta.url).pathname, input: payload,
      env: { ...process.env, DATABASE_URL: DB },
    });
    const { rows } = await getPool().query(`SELECT relevant FROM items WHERE id = $1`, [itemId]);
    expect(rows[0].relevant).toBe(false);
  });

  it('exits 2 when relevant is missing from the payload', () => {
    const missing = JSON.stringify({
      stream: 'news',
      blurb: 'A payload from before the relevance gate existed, thirty chars.',
      opportunity: false,
      opportunity_reason: null,
      entities: { organisations: [], deadlines: [], amounts: [] },
      excerpt: null,
    });
    try {
      execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
        cwd: new URL('..', import.meta.url).pathname, input: missing,
        env: { ...process.env, DATABASE_URL: DB },
      });
      expect.fail('expected exit code 2');
    } catch (err: unknown) {
      const error = err as { status?: number };
      expect(error.status).toBe(2);
    }
  });

  it('exits 2 on an invalid stream', () => {
    const bad = JSON.stringify({ stream: 'sport', relevant: true, blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: null });
    try {
      execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
        cwd: new URL('..', import.meta.url).pathname, input: bad,
        env: { ...process.env, DATABASE_URL: DB },
      });
      expect.fail('expected exit code 2');
    } catch (err: unknown) {
      const error = err as { status?: number };
      expect(error.status).toBe(2);
    }
  });

  it('exits 2 on malformed JSON', () => {
    const malformed = 'not valid json {';
    try {
      execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
        cwd: new URL('..', import.meta.url).pathname, input: malformed,
        env: { ...process.env, DATABASE_URL: DB },
      });
      expect.fail('expected exit code 2');
    } catch (err: unknown) {
      const error = err as { status?: number };
      expect(error.status).toBe(2);
    }
  });

  it('exits 2 on nonexistent item id with valid payload', () => {
    const payload = JSON.stringify({
      stream: 'tech_justice',
      relevant: true,
      blurb: 'A court digitisation pilot expands to two more registries this quarter.',
      opportunity: false,
      opportunity_reason: null,
      entities: { organisations: ['Federal Court'], deadlines: [], amounts: [] },
      excerpt: 'Pilot expands to two more registries.',
    });
    try {
      execFileSync('npx', ['tsx', 'src/save-enrichment.ts', '999999'], {
        cwd: new URL('..', import.meta.url).pathname, input: payload,
        env: { ...process.env, DATABASE_URL: DB },
      });
      expect.fail('expected exit code 2');
    } catch (err: unknown) {
      const error = err as { status?: number };
      expect(error.status).toBe(2);
    }
  });
});
