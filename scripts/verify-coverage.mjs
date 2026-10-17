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
const DEEP_LINK = '/coverage?theme=courts-tribunals&j=nsw';
const CELL = /^Courts and tribunals, New South Wales:/;
const FAB_VIEWPORT = { width: 430, height: 932 };
const FAB_CELL = /^Online safety and deepfakes, South Australia:/;

async function hydrated(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('main table button');
    return button !== null && Object.keys(button).some((key) => key.startsWith('__reactProps'));
  });
}

async function clearance(page) {
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const heading = document.getElementById('coverage-drilldown-heading').getBoundingClientRect();
    const header = document.querySelector('[data-site-header]').getBoundingClientRect();
    const strip = document.querySelector('main thead');
    const stripSticky = getComputedStyle(strip).position === 'sticky';
    const covered = stripSticky ? Math.max(header.bottom, strip.getBoundingClientRect().bottom) : header.bottom;
    return {
      headingTop: Math.round(heading.top),
      coveredTo: Math.round(covered),
      stripSticky,
      inViewport: heading.bottom <= window.innerHeight,
      scrollY: Math.round(window.scrollY),
    };
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
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await page.goto(`${base}${DEEP_LINK}`, { waitUntil: 'load' });
      await hydrated(page);
      const deepLink = await clearance(page);
      await page.screenshot({ path: `${dir}/${label}-deep-link.png` });
      assert(deepLink.scrollY > 0, `${label} deep link scrolled ${JSON.stringify(deepLink)}`);
      assert(deepLink.headingTop >= deepLink.coveredTo, `${label} deep link heading clear ${JSON.stringify(deepLink)}`);
      assert(deepLink.inViewport, `${label} deep link heading in viewport ${JSON.stringify(deepLink)}`);
      if (deepLink.stripSticky) {
        assert(deepLink.headingTop - deepLink.coveredTo <= 48, `${label} deep link heading close to the strip ${JSON.stringify(deepLink)}`);
      }
      assert.equal(deepLink.stripSticky, name === 'phone', `${label} strip sticky only on phone`);

      await page.goto(`${base}/coverage`, { waitUntil: 'load' });
      await hydrated(page);
      await page.getByRole('button', { name: CELL }).click();
      const click = await clearance(page);
      await page.screenshot({ path: `${dir}/${label}-click.png` });
      assert(click.headingTop >= click.coveredTo, `${label} click heading clear ${JSON.stringify(click)}`);
      assert(click.inViewport, `${label} click heading in viewport ${JSON.stringify(click)}`);

      assert.deepEqual(errors, [], `${label} errors`);
      results[label] = { deepLink, click };
      console.log(`${label}: ${JSON.stringify(results[label])}`);
      await context.close();
    }
  }
  for (const colorScheme of SCHEMES) {
    const label = `fab-${colorScheme}`;
    const context = await browser.newContext({ viewport: FAB_VIEWPORT, colorScheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${base}/coverage`, { waitUntil: 'load' });
    await hydrated(page);
    await page.evaluate(() => window.scrollTo(0, 1400));
    const fab = page.getByRole('button', { name: 'Scroll to top' });
    await fab.waitFor();
    await page.getByRole('button', { name: FAB_CELL }).click();
    await page.waitForTimeout(300);
    const clear = page.getByRole('button', { name: 'Clear selection' });
    const fabBand = (await fab.boundingBox()).y + 18;
    await page.evaluate((offset) => window.scrollBy(0, offset), (await clear.boundingBox()).y - fabBand);
    await page.waitForTimeout(300);
    const [clearBox, fabBox] = await Promise.all([clear.boundingBox(), fab.boundingBox()]);
    const overlap =
      clearBox.x < fabBox.x + fabBox.width &&
      fabBox.x < clearBox.x + clearBox.width &&
      clearBox.y < fabBox.y + fabBox.height &&
      fabBox.y < clearBox.y + clearBox.height;
    await page.screenshot({ path: `${dir}/${label}.png` });
    assert(!overlap, `${label} Clear selection clear of Scroll to top ${JSON.stringify({ clearBox, fabBox })}`);
    assert.deepEqual(errors, [], `${label} errors`);
    results[label] = { clearBox, fabBox, overlap };
    console.log(`${label}: ${JSON.stringify(results[label])}`);
    await context.close();
  }
  writeFileSync(`${dir}/verify-coverage.json`, JSON.stringify(results, null, 2));
  console.log('coverage scroll checks passed');
} finally {
  await browser.close();
}
