// Isolated production previews only. Start the A2J fixture with FIXTURE_WEEKLY=1.
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
const axe = readFileSync(require.resolve('axe-core/axe.js'), 'utf8');
const out = { passed: false, checks: [], errors: [], warnings: [], audits: [] };
page.on('pageerror', e => out.errors.push(e.message));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) out.warnings.push(m.text()); });
async function visit(url) {
  assert.equal((await page.goto(url, { waitUntil: 'domcontentloaded' })).status(), 200);
  await page.locator('main h1').waitFor();
}
async function audit(name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' overflow');
  // Finish finite theme transitions before measuring foreground/background pairs.
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', fullPage: true });
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
  out.audits.push({ name, violations: r.violations, incomplete: r.incomplete });
}
try {
  await visit(root);
  await page.getByRole('link', { name: 'This week', exact: true }).filter({visible:true}).click();
  await page.waitForURL('**/this-week');
  assert(await page.getByRole('heading', { name:'Verified developments', exact:true }).isVisible());
  assert(await page.getByRole('heading', { name:'Coming up', exact:true }).isVisible());
  assert.equal(await page.getByRole('link',{name:'This week',exact:true}).filter({visible:true}).getAttribute('aria-current'),'page');
  out.checks.push('Policai desktop navigation, active state and weekly sections');
  await visit(a2j+'/this-week');
  const opportunities = page.locator('#week-opportunities');
  const recent = page.locator('#week-developments');
  assert.equal(await opportunities.locator('article').count(),2);
  assert((await opportunities.innerText()).includes('Older open grant'));
  assert(!(await opportunities.innerText()).includes('Closed grant'));
  assert.equal(await recent.locator('article').count(),6);
  for(const excluded of ['Future publication','Older sector news','Older open grant','Screened fixture item']) assert(!(await recent.innerText()).includes(excluded),excluded);
  assert.equal(await recent.locator('a[href^="javascript:"]').count(),0);
  assert((await recent.innerText()).includes('Unsafe source link'));
  assert.equal(await page.locator('#week-deadlines article').count(),2);
  await page.getByRole('link',{name:'All opportunities',exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('opp')==='1'&&document.querySelectorAll('#radar-feed article').length===2);
  out.checks.push('A2J real SQL: six recent records, older open grant, closed/future exclusion, safe source URL and full-feed continuation');
  for(const [name,base] of [['policai',root],['a2j',a2j]]) {
    for(const theme of ['Light','Dark']) {
      await page.setViewportSize({width:1440,height:1000});
      await visit(base+'/this-week');
      await page.getByRole('radio',{name:theme,exact:true}).filter({visible:true}).click();
      for(const width of [1440,768,390,320]) {
        await page.setViewportSize({width,height:900});
        await audit(`${name}-${theme.toLowerCase()}-${width}`);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await visit(base+'/');
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    const link = page.getByRole('link',{name:'This week',exact:true}).filter({visible:true});
    await link.focus();await link.press('Enter');
    await page.waitForURL('**/this-week');
    assert(await page.getByRole('button',{name:'Open menu',exact:true}).isVisible());
    assert(await page.getByRole('heading',{name:'This week',exact:true}).isVisible());
    out.checks.push(`${name} mobile keyboard navigation closes drawer`);
  }
  assert.deepEqual(out.errors,[]);
  assert.equal(out.audits.flatMap(a=>a.violations).length,0);
  out.passed=true;
} finally {
  await browser.close();
  writeFileSync(`${dir}/weekly-browser.json`,JSON.stringify(out,null,2));
  console.log(JSON.stringify({passed:out.passed,checks:out.checks,errors:out.errors,warnings:out.warnings,audits:out.audits.map(a=>({name:a.name,violations:a.violations.map(v=>v.id),incomplete:a.incomplete.length}))},null,2));
}
