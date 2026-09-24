// Run with FIXTURE_DEPENDENCIES pointing to the disposable PGlite package.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { WEEKLY_ANCHOR_SQL, WEEKLY_DEVELOPMENTS_SQL, isStaleSnapshot, weekWindow } from '../lib/weekly-query.ts';
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
  await db.exec('DELETE FROM items');

  // --- P8: the window anchors to collection (max ok ingest_runs.created_at),
  // not the wall clock, and an old anchor renders as a historical snapshot. ---
  // No successful run yet: no anchor, so the page cannot invent a window.
  const { rows: [{ anchor: emptyAnchor }] } = await db.query(WEEKLY_ANCHOR_SQL);
  assert.equal(emptyAnchor, null, 'no anchor before any successful run');
  // An ok run eight days ago anchors the week; an item from just before that
  // run sits in the anchored window while the wall-clock week would exclude it.
  await db.query(`INSERT INTO ingest_runs(run_started_at,created_at,source_id,status) VALUES ($1,$1,1,'ok')`,
    [new Date(Date.now() - 8 * 86_400_000).toISOString()]);
  const { rows: [{ anchor }] } = await db.query(WEEKLY_ANCHOR_SQL);
  const anchorMs = new Date(anchor).getTime();
  const window = weekWindow(anchorMs);
  assert.equal(window.endMs, anchorMs, 'the window ends at the collection anchor');
  assert.equal(window.endMs - window.startMs, 168 * 3_600_000, '168-hour window');
  // The page's stale rule: the anchor itself ages out after a week.
  assert.equal(isStaleSnapshot(anchorMs, Date.now()), true, 'anchor eight days old is a historical snapshot');
  assert.equal(isStaleSnapshot(anchorMs - 3 * 86_400_000, Date.now()), true, 'anchor eleven days old is stale');
  assert.equal(isStaleSnapshot(Date.now(), Date.now()), false, 'a fresh anchor is not stale');
  // Boundary: exactly seven days old is not yet stale.
  const justInside = Date.now() - 7 * 86_400_000;
  assert.equal(isStaleSnapshot(justInside, Date.now()), false, 'exactly seven days is the boundary, not stale');
  assert.equal(isStaleSnapshot(justInside - 1, Date.now()), true, 'a second past seven days is stale');
  // A window anchored eight days back still selects its own last 168 hours —
  // items the wall-clock week would miss — and nothing older.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant)
    VALUES (1,$1,$1,'Anchor-week item',$2,true)`,
    ['https://example.org/anchor-week', new Date(anchorMs - 2 * 3_600_000)]);
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant)
    VALUES (1,$1,$1,'Older wall-clock item',$2,true)`,
    ['https://example.org/wallclock', new Date(anchorMs - 3 * 3_600_000)]);
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant)
    VALUES (1,$1,$1,'Before the anchor window',$2,true)`,
    ['https://example.org/before-window', new Date(anchorMs - 169 * 3_600_000)]);
  const historic = await db.query(WEEKLY_DEVELOPMENTS_SQL, [new Date(anchorMs).toISOString()]);
  assert.deepEqual(historic.rows.map(r => r.title), ['Anchor-week item', 'Older wall-clock item'],
    'the window follows collection, not the wall clock');
  console.log('PASS: seven-day window excludes old/future/screened items');
  console.log('PASS: weekly window anchors to the last ok run and flags a stale snapshot');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }