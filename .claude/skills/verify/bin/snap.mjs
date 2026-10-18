import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require('playwright-core');

const [path = '/', name = 'snap', ...flags] = process.argv.slice(2);
const base = process.env.POLICAI_VERIFY_URL;
const dir = process.env.POLICAI_EVIDENCE_DIR;
if (!base || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('POLICAI_VERIFY_URL must be a loopback URL');
if (!dir) throw new Error('Set POLICAI_EVIDENCE_DIR');
mkdirSync(dir, { recursive: true });

const phone = flags.includes('--phone');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium', headless: true });
const result = { url: `${base}${path}`, viewport: phone ? 'phone' : 'desktop', colorScheme: flags.includes('--dark') ? 'dark' : 'light', javaScript: !flags.includes('--no-js'), errors: [], failedRequests: [] };
try {
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    colorScheme: result.colorScheme,
    javaScriptEnabled: result.javaScript,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => result.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) result.failedRequests.push(`${r.status()} ${r.url()}`); });
  const response = await page.goto(result.url, { waitUntil: 'networkidle' });
  result.status = response.status();
  result.title = await page.title();
  result.h1 = (await page.locator('main h1').first().textContent().catch(() => null))?.trim() ?? null;
  result.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  writeFileSync(`${dir}/${name}.aria.yml`, await page.locator('body').ariaSnapshot());
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
  result.passed = result.status === 200 && result.errors.length === 0 && result.failedRequests.length === 0 && !result.horizontalOverflow;
} finally {
  await browser.close();
}
writeFileSync(`${dir}/${name}.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
