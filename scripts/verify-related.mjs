import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.POLICAI_VERIFY_URL || 'http://127.0.0.1:8894';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Use an isolated loopback test server');
const dir = process.env.POLICAI_EVIDENCE_DIR;
assert(dir, 'Set POLICAI_EVIDENCE_DIR to an evidence directory outside the checkout');
mkdirSync(dir, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const SCHEMES = ['light', 'dark'];
const LONG_LIST = '/policies/federal-court-gpn-ai';
const SUPERSEDED = '/policies/voluntary-ai-safety-standard';
const NO_LIST = '/policies/nsw-responsible-ai-guidance';
const TIMEZONES = ['Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC', 'Pacific/Pago_Pago'];
const VISIBLE = 8;

const listItems = (page) => page.locator('section[aria-labelledby="related-instruments"] ul > li');

function watch(page, errors) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
}

const results = {};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium',
  headless: true,
});
try {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    for (const colorScheme of SCHEMES) {
      const label = `${name}-${colorScheme}`;
      const context = await browser.newContext({ viewport, colorScheme });
      const page = await context.newPage();
      const errors = [];
      watch(page, errors);

      await page.goto(`${base}${LONG_LIST}`, { waitUntil: 'load' });
      const items = listItems(page);
      assert.equal(await items.count(), VISIBLE, `${label} first ${VISIBLE} items`);
      assert.equal(await items.locator('a[href^="/policies/"]').count(), VISIBLE, `${label} every item links to a record`);
      assert.equal(await items.getByText(/^Shares:/).count(), VISIBLE, `${label} every item names shared themes`);
      const expander = page.locator('section[aria-labelledby="related-instruments"] button');
      const total = Number((await expander.textContent()).match(/Show all (\d+) related/)[1]);
      assert(total > VISIBLE, `${label} total ${total}`);
      await page.waitForFunction(() => {
        const button = document.querySelector('section[aria-labelledby="related-instruments"] button');
        return button !== null && Object.keys(button).some((key) => key.startsWith('__reactProps'));
      });
      await expander.focus();
      await expander.click();
      assert.equal(await items.count(), total, `${label} expanded to ${total}`);
      assert.equal(await expander.getAttribute('aria-expanded'), 'true', `${label} aria-expanded`);
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Show fewer', `${label} focus stays`);
      await page.locator('#related-instruments').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/${label}-gpn-expanded.png` });

      await page.goto(`${base}${SUPERSEDED}`, { waitUntil: 'load' });
      assert.equal(await listItems(page).first().locator('p').first().textContent(), 'Superseded by', `${label} supersession first`);
      await page.locator('#related-instruments').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/${label}-superseded.png` });

      await page.goto(`${base}${NO_LIST}`, { waitUntil: 'load' });
      assert.equal(await page.locator('#related-instruments').count(), 0, `${label} no heading without connections`);

      assert.deepEqual(errors, [], `${label} errors`);
      results[label] = { total };
      console.log(`${label}: ${JSON.stringify(results[label])}`);
      await context.close();
    }
  }

  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS.desktop });
  const page = await noScript.newPage();
  await page.goto(`${base}${LONG_LIST}`, { waitUntil: 'load' });
  const items = listItems(page);
  assert.equal(await items.count(), VISIBLE, 'no-JS item count');
  for (let index = 0; index < VISIBLE; index += 1) {
    assert(await items.nth(index).isVisible(), `no-JS item ${index + 1} visible`);
  }
  assert(await page.locator('h1').isVisible(), 'no-JS heading visible');
  assert.equal(await page.locator('div[hidden][id^="S:"]').count(), 0, 'no-JS page has no streamed hidden segments');
  await page.locator('#related-instruments').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/no-js-gpn.png` });
  results.noJs = { items: await items.count() };
  console.log(`no-js: ${JSON.stringify(results.noJs)}`);
  await noScript.close();

  for (const timezoneId of TIMEZONES) {
    const context = await browser.newContext({ timezoneId, viewport: VIEWPORTS.phone });
    const tzPage = await context.newPage();
    const errors = [];
    watch(tzPage, errors);
    await tzPage.goto(`${base}${LONG_LIST}`, { waitUntil: 'load' });
    await tzPage.waitForTimeout(700);
    assert.deepEqual(errors, [], `${timezoneId} errors`);
    await context.close();
  }
  results.timezones = TIMEZONES;
  writeFileSync(`${dir}/verify-related.json`, JSON.stringify(results, null, 2));
  console.log('related instruments checks passed');
} finally {
  await browser.close();
}
