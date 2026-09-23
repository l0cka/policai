// Deadline accuracy checks against the synthetic fixture started with
// FIXTURE_DEADLINES=1 (see test/editorial-fixture.mjs). NEVER point at live data.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const dir = process.env.EVIDENCE_DIR;
if (!dir) throw new Error('Set EVIDENCE_DIR to an existing evidence directory');
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:8896';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Use the isolated loopback fixture preview only');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const out = { passed: false, checks: [], axe: [], errors: [] };
const axe = readFileSync(require.resolve('axe-core/axe.js'), 'utf8');
const official = 'https://consult.example.gov.au/fixture-consultation';
const writeUp = 'https://lawfirm.example.org/fixture-write-up';
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' })).newPage();
  page.on('pageerror', (e) => out.errors.push(e.message));
  const visit = async (route) => assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
  const audit = async (name) => {
    await page.addScriptTag({ content: axe });
    const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    out.axe.push({ name, violations: r.violations, incomplete: r.incomplete });
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
  };

  await visit('/deadlines');
  const closing = page.locator('section[aria-labelledby="closing-heading"] .timeline-entry');
  const officialCards = closing.filter({ has: page.locator(`h4 a[href="${official}"]`) });
  assert.equal(await officialCards.count(), 1, 'one card for the consultation');
  assert.equal(await closing.locator(`h4 a[href="${writeUp}"]`).count(), 0, 'the write-up is not a second card');
  const cardText = await officialCards.innerText();
  assert.match(cardText, /Also reported by 1/);
  assert.equal(await officialCards.locator(`.deadline-also a[href="${writeUp}"]`).count(), 1);
  out.checks.push('Duplicate reports merge into one card linked to the official page, with "also reported by 1"');

  assert.equal(await officialCards.locator('.deadline-secondary li').count(), 1);
  assert.match(await officialCards.locator('.deadline-secondary').innerText(), /alternative submission format/i);
  assert.equal(await closing.filter({ hasText: 'Ask for an alternative submission format' }).count(), 1, 'secondary date is not its own card');
  out.checks.push('Non-primary date renders as a secondary line under its item');

  const main = page.locator('main');
  assert.equal(await closing.filter({ hasText: 'Fixture internship program launches' }).count(), 0);
  assert.equal(await closing.filter({ hasText: 'Fixture inquiry report timetable' }).count(), 0);
  const calendar = page.locator('section[aria-labelledby="calendar-heading"]');
  const inquiry = calendar.locator('.dated-row').filter({ hasText: 'Fixture inquiry report timetable' });
  assert.equal(await inquiry.count(), 1);
  const when = inquiry.locator('time');
  assert.match((await when.textContent()).trim(), /^[A-Z][a-z]{2} \d{4}$/, 'month precision renders as "Mon YYYY"');
  assert.match(await when.getAttribute('datetime'), /^\d{4}-\d{2}$/);
  assert.equal(await calendar.locator('.dated-row').filter({ hasText: 'Fixture internship program launches' }).count(), 1);
  out.checks.push('Month-precision date and "Applications open" appear only in the calendar; month shown without a day');

  assert.equal(await main.locator('a[href="https://example.org/fixture-1"]').count(), 1, 'legacy fixture deadline still renders');
  out.checks.push('Legacy row without precision/primary still renders in Closing soon');
  await audit('deadlines-accuracy-light-desktop');

  await visit('/');
  const rail = page.locator('.rail .rail-deadline');
  assert.equal(await rail.filter({ has: page.locator(`a[href="${official}"]`) }).count(), 1);
  assert.equal(await rail.filter({ has: page.locator(`a[href="${writeUp}"]`) }).count(), 0);
  assert.equal(await rail.filter({ hasText: 'Fixture internship' }).count(), 0);
  out.checks.push('Feed rail shows the merged card once and no opening dates');

  await visit('/this-week');
  const week = page.locator('#week-deadlines .dated-row');
  assert.equal(await week.filter({ has: page.locator(`a[href="${official}"]`) }).count(), 1);
  assert.equal(await week.filter({ has: page.locator(`a[href="${writeUp}"]`) }).count(), 0);
  assert.equal(await week.filter({ hasText: 'Fixture internship' }).count(), 0);
  await audit('this-week-accuracy-light-desktop');
  out.checks.push('This-week deadlines use the same merged, primary-only list');

  await page.setViewportSize({ width: 390, height: 844 });
  await visit('/deadlines');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow');
  await audit('deadlines-accuracy-light-mobile');
  out.checks.push('Mobile /deadlines: no horizontal overflow');

  assert.deepEqual(out.errors, []);
  assert.equal(out.axe.flatMap((x) => x.violations).length, 0, 'No detected WCAG A/AA violations in sampled states');
  out.passed = true;
} catch (e) {
  out.failure = e.stack;
  throw e;
} finally {
  await browser.close();
  writeFileSync(`${dir}/deadlines-verification.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ passed: out.passed, checks: out.checks, errors: out.errors, axe: out.axe.map((x) => ({ name: x.name, violations: x.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), incomplete: x.incomplete.length })) }, null, 2));
}
