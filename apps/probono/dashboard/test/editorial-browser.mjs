import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const dir=process.env.EVIDENCE_DIR;
if (!dir) throw new Error('Set EVIDENCE_DIR to an existing evidence directory');
const base=process.env.TEST_BASE_URL ?? 'http://127.0.0.1:8896';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Use the isolated loopback fixture preview only');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN ?? '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const out={passed:false,checks:[],axe:[],errors:[]};
const axe=readFileSync(require.resolve('axe-core/axe.js'),'utf8');
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});
 const page=await context.newPage();page.on('pageerror',e=>out.errors.push(e.message));
 async function visit(route) {assert.equal((await page.goto(base+route,{waitUntil:'networkidle'})).status(),200);}
 async function audit(name) {await page.addScriptTag({content:axe});const r=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));out.axe.push({name,violations:r.violations,incomplete:r.incomplete});await page.screenshot({path:dir+'/'+name+'.png',animations:'disabled'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' horizontal overflow');}
 for(const theme of ['light','dark']) {
  await visit('/');await page.getByRole('radio',{name:theme==='light'?'Light':'Dark',exact:true}).filter({visible:true}).click();
  for(const [route,name] of [['/','feed'],['/deadlines','deadlines'],['/health','sources'],['/sector','sector']]) {await visit(route);await audit(name+'-'+theme+'-desktop');}
 }
 out.checks.push('Four routes: desktop light/dark screenshots, overflow and axe');
 await visit('/');await page.getByRole('radio',{name:'Light',exact:true}).filter({visible:true}).click();
 assert.equal(await page.locator('#radar-feed article').count(),4);
 for(const [label,title] of [['News','Community legal support expands'],['Law reform','Consultation on access to justice'],['Funding','Legal assistance funding round'],['Tech & justice','Digital justice service update']]) {
  await page.locator('.filters').getByRole('link',{name:label,exact:true}).click();await page.waitForLoadState('networkidle');await page.waitForFunction(()=>document.querySelectorAll('#radar-feed article').length===1);assert.equal(await page.locator('#radar-feed article').count(),1);await page.waitForFunction(title=>document.querySelector('#radar-feed article')?.textContent?.includes(title),title);assert((await page.locator('#radar-feed article').innerText()).includes(title));
 }
 await page.locator('.filters').getByRole('link',{name:'All',exact:true}).click();await page.waitForLoadState('networkidle');
 await page.locator('.filters').getByRole('link',{name:'Opportunities',exact:true}).click();await page.waitForLoadState('networkidle');await page.waitForFunction(()=>document.querySelectorAll('#radar-feed article').length===1);assert.equal(await page.locator('#radar-feed article').count(),1);assert((await page.locator('#radar-feed article').innerText()).includes('Submissions invited'));
 await visit('/?filtered=1');assert.equal(await page.locator('#radar-feed article').count(),1);assert((await page.locator('#radar-feed article').innerText()).includes('Screened fixture'));
 await visit('/?stream=news');await page.locator('#feed-search').fill('notarecordzz');await page.locator('#feed-search').press('Enter');await page.waitForLoadState('networkidle');assert(page.url().includes('stream=news'));assert.equal(await page.getByText('Nothing matches',{exact:true}).count(),1);await audit('feed-empty-light');
 await visit('/');await page.locator('#hero-search').fill('"Community legal support expands"');await page.getByRole('button',{name:'Search the radar',exact:true}).click();await page.waitForLoadState('networkidle');await page.waitForFunction(()=>document.querySelectorAll('#radar-feed article').length===1);assert.equal(await page.locator('#radar-feed article').count(),1);
 assert.equal(await page.locator('#radar-feed article a').first().getAttribute('href'),'https://example.org/fixture-0');assert((await page.locator('#radar-feed article').innerText()).includes('Example Community Legal Centre'));
 out.checks.push('All stream filters, opportunities, screened out, both searches, empty state, preserved query, provenance and source href');
 await visit('/');const summary=page.locator('.signal-disclosure summary');await summary.focus();await page.keyboard.press('Enter');assert.notEqual(await page.locator('.signal-disclosure').getAttribute('open'),null);assert(await page.locator('.signal-network-svg').isVisible());await audit('signal-network-light');await summary.focus();await page.keyboard.press('Space');assert.equal(await page.locator('.signal-disclosure').getAttribute('open'),null);out.checks.push('Signal network Enter/Space native disclosure and actual SVG');
 await visit('/deadlines');assert((await page.locator('main').innerText()).includes('CLOSING SOON'));assert.equal(await page.locator('main a[href="https://example.org/fixture-1"]').count(),1);out.checks.push('Deadline date and source link');
 await visit('/health');assert((await page.locator('main').innerText()).toLowerCase().includes('never run'));assert((await page.locator('main').innerText()).includes('Fixture: source unavailable'));out.checks.push('Source statuses: ok, failed, never-run and error retained');
 await visit('/sector');await page.getByRole('tab',{name:'System',exact:true}).click();await audit('sector-system-light');await page.getByRole('tab',{name:'Map',exact:true}).click();await page.locator('canvas').waitFor();assert(await page.locator('canvas').count());out.checks.push('Sector map and system switching, source-backed reference remains');
 await visit('/');await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert(await page.locator('#radar-feed').evaluate(el=>el.querySelector('.workspace-main').getBoundingClientRect().top < el.querySelector('.rail').getBoundingClientRect().top),'Mobile feed follows filters before secondary status rail');
 out.checks.push('Mobile reading order: results before status rail');
 for(const theme of ['light','dark']) {
  await page.getByRole('button',{name:'Open menu'}).click();await page.locator('#mobile-navigation').getByRole('radio',{name:theme==='light'?'Light':'Dark',exact:true}).click();await audit('mobile-menu-'+theme);await page.locator('#mobile-navigation a').first().focus();await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Open menu'}).evaluate(el=>el===document.activeElement));
  for(const [route,name] of [['/','feed'],['/deadlines','deadlines'],['/health','sources'],['/sector','sector']]) {await visit(route);await audit(name+'-'+theme+'-mobile');}
 }
 out.checks.push('Mobile four routes, both themes, menu and Escape focus restoration');
 await page.getByRole('button',{name:'Open menu'}).click();await page.locator('#mobile-navigation').getByRole('link',{name:'Deadlines',exact:true}).click();await page.waitForURL('**/deadlines');assert.equal(await page.locator('#mobile-navigation').count(),0);
 await page.getByRole('button',{name:'Open menu'}).click();const system=page.locator('#mobile-navigation').getByRole('radio',{name:'System',exact:true});await system.focus();await system.press('ArrowRight');assert.equal(await page.locator('#mobile-navigation').getByRole('radio',{name:'Dark',exact:true}).getAttribute('aria-checked'),'true');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.getByRole('button',{name:'Open menu'}).click();await page.locator('#mobile-navigation').getByRole('radio',{name:'System',exact:true}).click();await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(21, 27, 24)');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(248, 247, 243)');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(248, 247, 243)');
 out.checks.push('Mobile navigation closure; theme arrow keyboard, persistence, system colour scheme');
 await page.setViewportSize({width:320,height:700});await visit('/');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:dir+'/feed-320.png'});
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Skip to content');await page.keyboard.press('Enter');assert(page.url().endsWith('#main-content'));out.checks.push('320px overflow and keyboard skip link');
 assert.deepEqual(out.errors,[]);
 assert.equal(out.axe.flatMap(x=>x.violations).length,0,'No detected WCAG A/AA violations in sampled states');
 out.passed=true;
} catch(e){out.failure=e.stack;throw e;}finally {await browser.close();writeFileSync(dir+'/browser-verification.json',JSON.stringify(out,null,2));console.log(JSON.stringify({passed:out.passed,checks:out.checks,errors:out.errors,axe:out.axe.map(x=>({name:x.name,violations:x.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incomplete:x.incomplete.length}))},null,2));}
