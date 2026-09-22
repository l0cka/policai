// Run against production builds in isolated loopback previews only.
// A2J requires editorial-fixture.mjs with FIXTURE_ARCHIVE_COUNT=105.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const dir = process.env.EVIDENCE_DIR;
if (!dir) throw new Error('Set EVIDENCE_DIR');
mkdirSync(dir, { recursive: true });
const root = process.env.POLICAI_TEST_URL ?? 'http://127.0.0.1:8898';
const a2j = process.env.A2J_TEST_URL ?? 'http://127.0.0.1:8896';
for (const url of [root, a2j]) if (new URL(url).hostname !== '127.0.0.1') throw new Error('Loopback previews only');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN ?? '/usr/bin/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const out = { passed: false, checks: [], errors: [], warnings: [], audits: [] };
page.on('pageerror', e => out.errors.push(e.message));
page.on('console', m => { if (['error','warning'].includes(m.type())) out.warnings.push({type:m.type(),text:m.text()}); });
const axe = readFileSync(require.resolve('axe-core/axe.js'), 'utf8');
async function visit(url) { assert.equal((await page.goto(url, { waitUntil: 'networkidle' })).status(), 200); }
async function shot(name) {
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name+' overflows');
  await page.addScriptTag({content:axe});
  const audit = await page.evaluate(() => window.axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  out.audits.push({name, violations:audit.violations, incomplete:audit.incomplete});
}
try {
  await visit(root+'/?q=assurance&view=table');
  await page.waitForFunction(() => document.querySelector('#register-search')?.value === 'assurance');
  assert(await page.getByRole('table').isVisible());
  await page.getByRole('searchbox').fill('all');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === 'all');
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => document.querySelector('#register-search')?.value === 'all');
  await page.getByRole('button',{name:'Clear search and filters'}).click();
  const header=page.getByRole('table').getByRole('button',{name:'Policy',exact:true});
  for(const direction of ['ascending','descending','ascending','descending']) {
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.waitForFunction(() => new URLSearchParams(location.search).get('page') === '2');
    await header.focus();await header.press(direction==='ascending'?'Enter':'Space');
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('page'));
    assert.equal(await header.evaluate(el=>el===document.activeElement),true);
    assert.equal(await header.locator('..').getAttribute('aria-sort'),direction);
  }
  out.checks.push('Register URL hydration/reload, literal all, repeated keyboard sorting and pagination reset/focus');
  await page.getByRole('combobox',{name:'Sort policies'}).selectOption('jurisdiction:asc');
  const jurisdictions=await page.locator('tbody tr td:nth-child(2)').allTextContents();
  assert(jurisdictions[0].includes('Australian Capital Territory'));
  await page.getByRole('button',{name:'List',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  const detail=page.locator('#policy-register article h2 a').filter({visible:true}).last();
  await detail.scrollIntoViewIfNeeded();const title=await detail.textContent();
  const beforeScroll=await page.evaluate(()=>scrollY);const researchUrl=page.url();
  await detail.click();await page.waitForURL('**/policies/**');
  assert((await page.locator('h1').innerText()).includes(title.trim()));
  await page.goBack({waitUntil:'networkidle'});
  await page.waitForFunction(() => new URLSearchParams(location.search).get('page') === '2');
  assert.equal(page.url(),researchUrl);
  await page.waitForFunction(y=>Math.abs(scrollY-y)<80,beforeScroll,{timeout:5000});
  out.checks.push('Register detail → Back preserves page, sort, query and reading position');
  assert(await page.locator('#policy-register article p.line-clamp-2').filter({visible:true}).first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14), 'Readable list summaries');
  await page.evaluate(()=>scrollTo(0,0));await shot('policai-desktop-after');
  await page.getByRole('searchbox').fill('no-record-zz');
  await page.getByRole('button',{name:'Reset the register'}).waitFor();
  await shot('policai-empty-after');
  await page.getByRole('button',{name:'Reset the register'}).click();assert(await page.getByRole('searchbox').evaluate(el=>el===document.activeElement));
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await shot('policai-mobile-after');
  await page.setViewportSize({width:320,height:740});await shot('policai-320-after');
  out.checks.push('Register empty recovery with search focus; desktop/390px/320px screenshots and axe');

  await page.setViewportSize({width:1440,height:1000});await visit(a2j);
  assert((await page.locator('main').innerText()).includes('Synthetic test record'));
  const ids=[];
  for(let n=1;n<=5;n++) {
    await visit(a2j+`/?page=${n}#radar-feed`);
    assert((await page.locator('.radar-pagination').first().innerText()).includes(`Page ${n} of 5`));
    ids.push(...await page.locator('#radar-feed article').evaluateAll(els=>els.map(el=>el.dataset.recordId)));
  }
  assert.equal(ids.length,109);assert.equal(new Set(ids).size,109);
  out.checks.push('A2J full archive: all 109 fixture records across five pages; no missing/duplicated tied-date rows');
  await visit(a2j+'/?stream=funding&page=999#radar-feed');
  assert.equal(await page.locator('#radar-feed article').count(),6);
  assert((await page.locator('.radar-pagination').first().innerText()).includes('101–106 of 106'));
  await page.getByRole('navigation',{name:'Radar pages (top)'}).getByRole('link',{name:'Newer'}).click();
  await page.waitForURL('**/?stream=funding&page=4#radar-feed');
  await page.waitForFunction(()=>document.querySelectorAll('#radar-feed article').length===25);
  out.checks.push('A2J out-of-range page clamp and Older/Newer links retain filters');
  await page.locator('#feed-search').fill('"Example funding source"');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.waitForLoadState('networkidle');
  assert(!new URL(page.url()).searchParams.has('page'));
  assert((await page.locator('.radar-pagination').first().innerText()).includes('of 105'));
  assert.equal(await page.locator('.recent-signals').count(),0);
  assert.equal(await page.locator('.signal-disclosure').count(),0);
  await shot('a2j-search-desktop-after');
  out.checks.push('A2J source-name search, page reset, count consistency and focused research layout');
  await page.locator('#feed-search').fill("'; SELECT * FROM items; --");
  await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForLoadState('networkidle');
  assert(await page.getByText('Nothing matches',{exact:true}).isVisible());
  await page.locator('.empty-state').getByRole('link',{name:'Clear search and filters'}).click();
  await page.waitForURL(a2j+'/#radar-feed');
  await page.waitForFunction(()=>document.querySelectorAll('#radar-feed article').length===25);
  out.checks.push('A2J SQL-shaped query remains data; one-click empty-result recovery');
  await visit(a2j+'/?filtered=1#radar-feed');assert.equal(await page.locator('#radar-feed article').count(),1);
  assert((await page.locator('#radar-feed article').innerText()).includes('Screened fixture'));
  await visit(a2j+'/?opp=1#radar-feed');assert.equal(await page.locator('#radar-feed article').count(),1);
  assert((await page.locator('#radar-feed article').innerText()).includes('Submissions invited'));
  await visit(a2j+'/?stream=__proto__&page=-1#radar-feed');assert.equal(await page.locator('#radar-feed article').count(),25);
  out.checks.push('A2J screened/open-opportunity boundaries and malformed URL normalization');
  await page.setViewportSize({width:390,height:844});
  await visit(a2j);await page.locator('.filters').getByRole('link',{name:'Funding',exact:true}).click();
  await page.waitForURL('**/?stream=funding#radar-feed');
  await page.waitForFunction(()=>document.querySelector('.radar-pagination')?.textContent.includes('of 106'));
  await page.waitForFunction(()=>document.querySelector('#radar-feed').getBoundingClientRect().top<250);
  await shot('a2j-mobile-filter-after');
  await page.locator('#feed-search').fill('zznomatch');await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForLoadState('networkidle');
  await shot('a2j-empty-after');
  await page.setViewportSize({width:320,height:740});await shot('a2j-320-after');
  out.checks.push('A2J mobile filters land on results; desktop/390px/320px empty/filter screenshots and axe');
  assert.deepEqual(out.errors,[]);
  assert.equal(out.audits.flatMap(a=>a.violations).length,0,'No sampled A/AA violations');
  out.passed=true;
} catch(e) { out.failure=e.stack;throw e; }
finally {await browser.close();writeFileSync(dir+'/research-browser.json',JSON.stringify(out,null,2));console.log(JSON.stringify({passed:out.passed,checks:out.checks,errors:out.errors,warnings:out.warnings,audits:out.audits.map(a=>({name:a.name,violations:a.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incomplete:a.incomplete.length}))},null,2));}
