// Integration over the disposable in-memory Postgres fixture. Run with
// FIXTURE_DEPENDENCIES pointing to the scratch package with
// @electric-sql/pglite. Never connects to a live database.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {
  SOURCE_HEALTH_SQL,
  sourceHealthState,
  summarizeSourceHealth,
} from '../lib/health-data.ts';
import { statusPayload } from '../lib/status-payload.ts';
if (!process.env.FIXTURE_DEPENDENCIES) throw new Error('Set FIXTURE_DEPENDENCIES');
const require = createRequire(resolve(process.env.FIXTURE_DEPENDENCIES, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
try {
  await db.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));

  // --- P1: synthetic ingest_runs over four active sources and one inactive. ---
  // A: latest run ok, fresh. B: latest run ok but old -> overdue.
  // C: latest run failed with an older ok run -> failed, not overdue.
  // D: never run. E: inactive with a stale ok run -> excluded.
  // created_at carries the run time in production (the worker inserts with the
  // DEFAULT, seconds after run_started_at), so the fixture sets it explicitly.
  await db.exec(`
    INSERT INTO sources(name,url,fetch_method,active) VALUES
      ('Fresh source','https://example.org/fresh','rss',true),
      ('Stale source','https://example.org/stale','rss',true),
      ('Broken source','https://example.org/broken','firecrawl',true),
      ('New source','https://example.org/new','rss',true),
      ('Retired source','https://example.org/retired','rss',false);
    INSERT INTO ingest_runs(run_started_at,created_at,source_id,status,items_found,items_new,error) VALUES
      (now() - interval '2 hours', now() - interval '2 hours',    1, 'ok', 5, 1, NULL),
      (now() - interval '8 days',  now() - interval '8 days',     2, 'ok', 4, 0, NULL),
      (now() - interval '30 minutes', now() - interval '30 minutes', 3, 'failed', 0, 0, 'Fixture: upstream unavailable'),
      (now() - interval '9 days',  now() - interval '9 days',     3, 'ok', 2, 0, NULL),
      (now() - interval '3 days',  now() - interval '3 days',     5, 'ok', 1, 0, NULL);
  `);
  const { rows: health } = await db.query(SOURCE_HEALTH_SQL);
  assert.equal(health.length, 5, 'one row per source, active and inactive');
  const byName = Object.fromEntries(health.map((r) => [r.name, r]));
  assert.equal(sourceHealthState(byName['Fresh source']), 'ok');
  assert.equal(sourceHealthState(byName['Stale source']), 'overdue');
  assert.equal(sourceHealthState(byName['Broken source']), 'failed');
  assert.equal(byName['Broken source'].error, 'Fixture: upstream unavailable', 'failed keeps its last error');
  assert.notEqual(byName['Broken source'].last_ok_at, null, 'older ok run stays visible');
  assert.equal(sourceHealthState(byName['New source']), 'never');
  assert.equal(byName['Fresh source'].last_status, 'ok');
  assert.equal(byName['Stale source'].last_status, 'ok', 'stale means an old ok run, not a failed one');
  assert.equal(sourceHealthState(byName['Retired source']), 'retired');
  const summary = summarizeSourceHealth(health);
  assert.deepEqual(
    { total: summary.total, ok: summary.ok, overdue: summary.overdue, failed: summary.failed, never: summary.never },
    { total: 4, ok: 1, overdue: 1, failed: 1, never: 1 },
  );
  assert.equal(summary.reporting, 1, 'overdue and failed sources do not count as reporting');

  // --- P2: fixture items missing each expected field, one SQL, same population. ---
  // Seven relevant items, each carrying every expected field except the one
  // under test (so each missing count stays 1), plus a screened-out item
  // missing everything that must not be counted. deadlines shapes: an object
  // instead of an array, and an array with a non-object entry.
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const fullDeadlines = JSON.stringify({ deadlines: [{ date: day(10), label: 'Fixture closes' }] });
  const badObject = JSON.stringify({ deadlines: { date: day(5) } });
  const badArrayEntry = JSON.stringify({ deadlines: ['2026-10-01'] });
  // Complete reference item.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,blurb,relevant,entities)
    VALUES (1,$1,$1,'Complete fixture item',now(),'Complete excerpt.','news','Complete blurb.',true,$2)`,
    ['https://example.org/item-complete', fullDeadlines]);
  // Missing stream only.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,blurb,relevant,entities)
    VALUES (1,$1,$1,'No stream fixture item',now(),'Complete excerpt.','Complete blurb.',true,$2)`,
    ['https://example.org/item-nostream', fullDeadlines]);
  // Missing blurb only.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,relevant,entities)
    VALUES (1,$1,$1,'No blurb fixture item',now(),'Complete excerpt.','law_reform',true,$2)`,
    ['https://example.org/item-noblurb', fullDeadlines]);
  // Missing excerpt only.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,blurb,stream,relevant,entities)
    VALUES (1,$1,$1,'No excerpt fixture item',now(),'Complete blurb.','funding',true,$2)`,
    ['https://example.org/item-noexcerpt', fullDeadlines]);
  // Missing published_at only.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,excerpt,stream,blurb,relevant,entities)
    VALUES (1,$1,$1,'No published date fixture item','Complete excerpt.','tech_justice','Complete blurb.',true,$2)`,
    ['https://example.org/item-nodate', fullDeadlines]);
  // Missing deadlines (object instead of array).
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,blurb,relevant,entities)
    VALUES (1,$1,$1,'Deadline object fixture item',now(),'Complete excerpt.','news','Complete blurb.',true,$2)`,
    ['https://example.org/item-deadline-object', badObject]);
  // Missing deadlines (array with a non-object entry).
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,blurb,relevant,entities)
    VALUES (1,$1,$1,'Deadline string entry fixture item',now(),'Complete excerpt.','news','Complete blurb.',true,$2)`,
    ['https://example.org/item-deadline-string', badArrayEntry]);
  // Screened out: missing everything, never counted.
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,excerpt,stream,relevant)
    VALUES (1,$1,$1,'Screened fixture item','Screened out of the counts.','news',false)`, ['https://example.org/item-screened']);

  const { rows: [completeness] } = await db.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE i.stream IS NULL)::int AS missing_stream,
           count(*) FILTER (WHERE coalesce(btrim(i.blurb), '') = '')::int AS missing_blurb,
           count(*) FILTER (WHERE coalesce(btrim(i.excerpt), '') = '')::int AS missing_excerpt,
           count(*) FILTER (WHERE i.published_at IS NULL)::int AS missing_published_at,
           count(*) FILTER (WHERE NOT COALESCE(
             jsonb_typeof(i.entities->'deadlines') = 'array'
             AND (SELECT bool_and(coalesce(jsonb_typeof(d), 'null') = 'object' AND d ? 'date')
                  FROM jsonb_array_elements(i.entities->'deadlines') d),
             false))::int AS missing_deadlines
    FROM items i WHERE i.relevant`);
  assert.deepEqual(completeness, {
    total: 7,
    missing_stream: 1,
    missing_blurb: 1,
    missing_excerpt: 1,
    missing_published_at: 1,
    missing_deadlines: 2,
  });

  // --- P5/P7: the JSON payload and XML-escape checks. ---
  const payload = statusPayload(summary, 3, summary.total ? new Date().toISOString() : null);
  assert.equal(payload.sources.total, 4);
  assert.equal(payload.sources.overdue, 1);
  assert.equal(payload.sources.failed, 1);
  assert.equal(payload.sources.never, 1);
  assert.equal(payload.sources.overdueAfterDays, 3);
  assert.equal(payload.success, true);
  // A name carrying XML metacharacters must escape cleanly into sitemap XML
  // and survive a JSON round-trip in the status payload.
  const hostile = '<Fixture & "Source">';
  const xmlEscaped = hostile
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const entry = '<url><loc>https://a2j.policai.org</loc></url>'
    .replace('https://a2j.policai.org', xmlEscaped);
  assert.match(entry, /&lt;Fixture &amp; &quot;Source&quot;&gt;/);
  assert.doesNotMatch(entry, /<Fixture /);
  const round = JSON.parse(JSON.stringify(statusPayload(summary, 3, null)));
  assert.equal(round.sources.total, summary.total);

  console.log('PASS: source health states, completeness counts and status payload over the PGlite fixture');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }