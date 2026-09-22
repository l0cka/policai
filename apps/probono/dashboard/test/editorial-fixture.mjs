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
const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:8897,maxConnections:10});
await server.start();console.log('Fixture ready at 127.0.0.1:8897 (in-memory only)');
for(const sig of ['SIGTERM','SIGINT']) process.on(sig,async()=>{await server.stop();await db.close();process.exit(0);});
