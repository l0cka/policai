// Run with FIXTURE_DEPENDENCIES pointing to the disposable PGlite package.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { WEEKLY_DEVELOPMENTS_SQL } from '../lib/weekly-query.ts';
if (!process.env.FIXTURE_DEPENDENCIES) throw new Error('Set FIXTURE_DEPENDENCIES');
const require = createRequire(resolve(process.env.FIXTURE_DEPENDENCIES, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
try {
  await db.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  await db.exec(`INSERT INTO sources(name,url,fetch_method) VALUES ('Synthetic source','https://example.org','rss');`);
  await db.exec('BEGIN');
  const { rows: [{ now }] } = await db.query('SELECT now()');
  for (const [name, days, relevant] of [['recent',1,true],['boundary',7,true],['old',8,true],['future',-1,true],['screened',1,false]]) {
    await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant) VALUES (1,$1,$1,$2,$3::timestamptz - $4 * interval '1 day',$5)`, [`https://example.org/${name}`,name,now,days,relevant]);
  }
  const { rows } = await db.query(WEEKLY_DEVELOPMENTS_SQL, [now]);
  assert.deepEqual(rows.map(r => r.title), ['recent','boundary']);
  assert.equal(rows[0].total, 2);
  for (let i = 0; i < 15; i++) {
    await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant) VALUES (1,$1,$1,$2,$3,true)`, [`https://example.org/extra-${i}`, `extra-${i}`, now]);
  }
  const capped = await db.query(WEEKLY_DEVELOPMENTS_SQL, [now]);
  assert.equal(capped.rows.length, 12);
  assert.equal(capped.rows[0].total, 17);
  assert.equal(capped.rows[0].title, 'extra-14');
  const empty = await db.query(WEEKLY_DEVELOPMENTS_SQL, ['2000-01-01T00:00:00Z']);
  assert.equal(empty.rows.length, 0);
  await db.exec("DELETE FROM items; SET TIME ZONE 'Australia/Sydney'");
  const dstEnd = new Date('2026-10-05T00:00:00Z');
  const boundary = new Date(dstEnd.getTime() - 7 * 86400000);
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant) VALUES (1,'https://example.org/dst','https://example.org/dst','DST boundary',$1,true)`, [boundary]);
  assert.equal((await db.query(WEEKLY_DEVELOPMENTS_SQL, [dstEnd])).rows.length, 1, 'seven elapsed days across DST');
  console.log('PASS: seven-day window excludes old/future/screened items');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }
