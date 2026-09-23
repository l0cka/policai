// Disposable in-memory PostgreSQL-compatible fixture. NEVER connect to a live DB.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.FIXTURE_DEPENDENCIES) throw new Error('Set FIXTURE_DEPENDENCIES to the scratch npm package directory');
const require=createRequire(resolve(process.env.FIXTURE_DEPENDENCIES,'package.json'));
const { PGlite }=require('@electric-sql/pglite');
const { PGLiteSocketServer }=require('@electric-sql/pglite-socket');
import { readFileSync } from 'node:fs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const deadline=new Date(Date.now()+23*86400000).toISOString().slice(0,10);
const db=await PGlite.create();
await db.exec(readFileSync(root+'/apps/probono/db/schema.sql','utf8'));
await db.exec(`INSERT INTO sources(name,url,fetch_method) VALUES ('Example Community Legal Centre','https://example.org/legal','rss'),('Example Reform Commission','https://example.org/reform','rss'),('Example funding source','https://example.org/funding','firecrawl');
INSERT INTO ingest_runs(run_started_at,source_id,status,items_found,items_new,error) VALUES (now(),1,'ok',3,2,NULL),(now(),2,'failed',0,0,'Fixture: source unavailable');`);
for(const [i,stream] of ['news','law_reform','funding','tech_justice'].entries()) {
 await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,blurb,opportunity,opportunity_reason,entities,relevant) VALUES ($1,$2,$2,$3,now()-($4 * interval '1 day'),$5,$6,$5,$7,$8,$9,true)`,[i%2+1,`https://example.org/fixture-${i}`,['Community legal support expands','Consultation on access to justice','Legal assistance funding round','Digital justice service update'][i],i,'Synthetic test record — not published news. Verify details at the linked source.',stream,i===1,i===1?'Submissions invited for the fixture consultation':null,JSON.stringify({deadlines:i===1?[{date:deadline,label:'Fixture submissions close'}]:[]})]);
}
await db.exec(`INSERT INTO items(source_id,url,canonical_url,title,excerpt,stream,relevant) VALUES(1,'https://example.org/screened','https://example.org/screened','Screened fixture item','Synthetic screened record','news',false);`);
// Opt-in archive volume for pagination tests; the original four-record fixture remains the default.
const archiveCount = Number(process.env.FIXTURE_ARCHIVE_COUNT ?? 0);
if (!Number.isInteger(archiveCount) || archiveCount < 0 || archiveCount > 200) throw new Error('Invalid fixture archive count');
for (let i = 0; i < archiveCount; i++) {
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,relevant)
    VALUES(3,$1,$1,$2,now()-interval '40 days','Synthetic archive record — not published news.','funding',true)`,
    [`https://example.org/archive-${i}`, `Archive funding signal ${String(i).padStart(3,'0')}`]);
}
if (process.env.FIXTURE_WEEKLY === '1') {
  for (const [name, age, opportunity, deadlineDays, url] of [
    ['Older open grant', 60, true, 2, 'https://example.org/old-open'],
    ['Closed grant', 1, true, -1, 'https://example.org/closed'],
    ['Future publication', -3, false, null, 'https://example.org/future'],
    ['Older sector news', 9, false, null, 'https://example.org/old-news'],
    ['Unsafe source link', 1, false, null, 'javascript:alert(1)'],
  ]) {
    const deadlines = deadlineDays === null ? [] : [{ date: new Date(Date.now() + deadlineDays * 86400000).toISOString().slice(0,10), label: 'Fixture applications close', kind: 'action' }];
    await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,relevant,opportunity,entities,stream) VALUES (1,$1,$1,$2,now()-$3 * interval '1 day',true,$4,$5,'funding')`, [url,name,age,opportunity,JSON.stringify({deadlines})]);
  }
}
// Opt-in: a title stored before the listing-title fix, to prove display cleanup.
if (process.env.FIXTURE_MARKDOWN_TITLE === '1') {
  await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,stream,relevant) VALUES (3,$1,$1,$2,now()-interval '2 days','funding',true)`,
    ['https://example.org/markdown-title', 'Fixture News\\ \\ August 27, 2026\\ \\ ##### Fixture consultant sought for a data fund']);
}
// Opt-in deadline accuracy rows: one consultation reported by an official page and a
// law-firm write-up (merged into one card), a non-primary secondary date, a
// month-precision report date and a legacy "Applications open" row that must not
// read as a deadline. Checked by test/deadlines-browser.mjs.
if (process.env.FIXTURE_DEADLINES === '1') {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const inTwoMonths = new Date(); inTwoMonths.setUTCDate(1); inTwoMonths.setUTCMonth(inTwoMonths.getUTCMonth() + 2);
  const monthStart = inTwoMonths.toISOString().slice(0, 8) + '01';
  const official = 'https://consult.example.gov.au/fixture-consultation';
  const q = (date) => `Submissions close ${Number(date.slice(8))} ${new Date(date + 'T00:00:00Z').toLocaleDateString('en-AU', { month: 'long', timeZone: 'UTC' })}`;
  for (const [url, title, published, deadlines] of [
    [official, 'Fixture official consultation on legal help', 6, [
      { date: day(40), label: 'Submissions close', kind: 'action', precision: 'day', primary: true, quote: q(day(40)), target_url: null },
      { date: day(12), label: 'Ask for an alternative submission format', kind: 'action', precision: 'day', primary: false, quote: q(day(12)), target_url: null },
    ]],
    ['https://lawfirm.example.org/fixture-write-up', 'Fixture law firm write-up of the consultation', 3, [
      { date: day(40), label: 'Have your say on the legal help consultation', kind: 'action', precision: 'day', primary: true, quote: q(day(40)), target_url: official },
    ]],
    ['https://example.org/fixture-inquiry', 'Fixture inquiry report timetable', 4, [
      { date: monthStart, label: 'Final report expected', kind: 'milestone', precision: 'month', primary: false, quote: 'final report expected later in the year', target_url: null },
    ]],
    ['https://example.org/fixture-internship', 'Fixture internship program launches', 2, [
      { date: day(5), label: 'Applications open', kind: 'action' },
    ]],
  ]) {
    await db.query(`INSERT INTO items(source_id,url,canonical_url,title,published_at,excerpt,stream,blurb,relevant,entities) VALUES (2,$1,$1,$2,now()-$3 * interval '1 day','Synthetic deadline record — not published news.','law_reform','Synthetic deadline record — not published news.',true,$4)`, [url, title, published, JSON.stringify({ deadlines })]);
  }
}
if (process.env.FIXTURE_EMPTY === '1') await db.exec('DELETE FROM items');
const port=Number(process.env.FIXTURE_PORT ?? 8897);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid FIXTURE_PORT');
const server=new PGLiteSocketServer({db,host:'127.0.0.1',port,maxConnections:10});
await server.start();console.log(`Fixture ready at 127.0.0.1:${port} (in-memory only)`);
for(const sig of ['SIGTERM','SIGINT']) process.on(sig,async()=>{await server.stop();await db.close();process.exit(0);});
