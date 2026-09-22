// Run against an isolated production build, never a live service.
// POLICAI_VERIFY_URL=http://127.0.0.1:8894 POLICAI_EVIDENCE_DIR=/path node scripts/verify-editorial.mjs
// Optional AXE_CORE_PATH=/path/to/axe.min.js enables WCAG 2 A/AA checks.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.env.POLICAI_VERIFY_URL || 'http://127.0.0.1:8894';
assert(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname),
  'Use an isolated loopback test server',
);
const dir = process.env.POLICAI_EVIDENCE_DIR;
assert(
  dir,
  'Set POLICAI_EVIDENCE_DIR to an evidence directory outside the checkout',
);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
let passed = false;
const checks = [],
  errors = [],
  accessibility = [],
  screenshots = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const visible = (locator) => locator.filter({ visible: true });
async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path, animations: 'disabled' });
  screenshots.push(path);
}
async function audit(name) {
  if (!process.env.AXE_CORE_PATH) return;
  await page.addScriptTag({ path: process.env.AXE_CORE_PATH });
  const result = await page.evaluate(async () => {
    const { violations, incomplete } = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return {
      violations: violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      incomplete: incomplete.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
          any: n.any.map((c) => ({ id: c.id, message: c.message })),
        })),
      })),
    };
  });
  accessibility.push({ name, ...result });
}
async function theme(name, mobile) {
  if (mobile)
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await visible(page.getByRole('radio', { name, exact: true })).click();
  if (mobile)
    await page.getByRole('button', { name: 'Close menu', exact: true }).click();
}
async function openFilter(name) {
  const details = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: name }) });
  if (!(await details.evaluate((d) => d.open)))
    await details.locator('summary').click();
  return details;
}
async function choose(name, option) {
  const details = await openFilter(name);
  const checkbox = details.getByRole('checkbox', { name: option });
  await checkbox.locator('..').click();
  assert(await checkbox.isChecked());
  await page.keyboard.press('Escape');
  assert.equal(await details.evaluate((d) => d.open), false);
}
try {
  assert.equal((await page.goto(url)).status(), 200);
  await page
    .getByRole('heading', { level: 1, name: 'Australian AI policy.' })
    .waitFor();
  const payload = await (
    await context.request.get(`${url}/api/policies`)
  ).json();
  const policies = payload.policies || payload.data || payload;
  assert(Array.isArray(policies));
  assert.equal(new Set(policies.map((p) => p.id)).size, policies.length);
  assert(
    policies.every(
      (p) => p.verification.status === 'verified' && p.status !== 'trashed',
    ),
  );
  assert(
    (await page.getByRole('status').innerText()).startsWith(
      `${policies.length} policies`,
    ),
  );
  assert.equal(
    await visible(page.locator('#policy-register article')).count(),
    Math.min(8, policies.length),
  );
  checks.push(
    'Public API verified records, unique ids and rendered total agree',
  );

  await page.keyboard.press('Control+k');
  assert(
    await page
      .getByRole('searchbox')
      .evaluate((e) => e === document.activeElement),
  );
  await page.getByRole('searchbox').fill('Fair Work');
  await page.waitForFunction(() =>
    document.querySelector('[role=status]').textContent.includes('1 policy'),
  );
  assert.equal(
    await visible(page.locator('#policy-register article')).count(),
    1,
  );
  await page.getByRole('searchbox').fill('zz-no-such-policy-zz');
  await page.getByText('Nothing matches those filters').waitFor();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  checks.push('Ctrl+K, live search, empty state and reset');

  await choose('Jurisdiction', /Federal/);
  await choose('Jurisdiction', /New South Wales/);
  const jurisdictions = policies.filter((p) =>
    ['federal', 'nsw'].includes(p.jurisdiction),
  );
  assert(
    (await page.getByRole('status').innerText()).startsWith(
      `${jurisdictions.length} policies`,
    ),
  );
  await choose('Policy type', /Practice Note/);
  await choose('Status', /^Active/);
  const combined = jurisdictions.filter(
    (p) => p.type === 'practice_note' && p.status === 'active',
  );
  assert(
    (await page.getByRole('status').innerText()).startsWith(
      `${combined.length} polic`,
    ),
  );
  await page
    .getByRole('button', { name: 'Remove filter: Active', exact: true })
    .click();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  checks.push(
    'Multi-select jurisdictions + type + status, filter chips and Escape dismissal',
  );

  await page
    .getByRole('combobox', { name: 'Sort policies' })
    .selectOption('title:asc');
  const firstTitle = policies.toSorted((a, b) =>
    a.title.localeCompare(b.title),
  )[0].title;
  assert.equal(
    await visible(page.locator('#policy-register article h2'))
      .first()
      .innerText(),
    firstTitle,
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert((await page.getByText(/Page 2 of/).innerText()).includes('Page 2'));
  await page
    .getByRole('combobox', { name: 'Sort policies' })
    .selectOption('effectiveDate:desc');
  await page.getByText(/Page 1 of/).waitFor();
  await visible(
    page.getByRole('button', { name: 'Table', exact: true }),
  ).click();
  const sortSelect = page.getByRole('combobox', { name: 'Sort policies' });
  const sortColumns = [
    ['title', 'Policy'], ['jurisdiction', 'Jurisdiction'], ['type', 'Type'],
    ['status', 'Status'], ['effectiveDate', 'Key date'],
  ];
  const sortValue = (policy, field) => field === 'effectiveDate'
    ? (policy.dates.find((date) => date.primary) ?? policy.dates[0])?.date ?? policy.effectiveDate
    : policy[field];
  async function assertSort(field, name, direction) {
    const header = page.getByRole('columnheader', { name, exact: true });
    await page.waitForFunction(({ field, direction }) =>
      document.querySelector('select').value === `${field}:${direction}`,
    { field, direction });
    assert.equal(await sortSelect.inputValue(), `${field}:${direction}`);
    assert.equal(await header.getAttribute('aria-sort'), direction === 'asc' ? 'ascending' : 'descending');
    const expected = policies.toSorted((a, b) =>
      String(sortValue(a, field)).localeCompare(String(sortValue(b, field))) * (direction === 'asc' ? 1 : -1),
    ).slice(0, 8).map((policy) => `/policies/${policy.id}`);
    assert.deepEqual(await page.locator('tbody tr td:first-child a').evaluateAll((links) =>
      links.map((link) => link.getAttribute('href'))), expected);
    await page.getByText(/Page 1 of/).waitFor();
  }
  for (const [field, name] of sortColumns) {
    const button = page.locator('th').getByRole('button', { name, exact: true });
    for (const direction of ['asc', 'desc']) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText(/Page 2 of/).waitFor();
      await sortSelect.selectOption(`${field}:${direction}`);
      await assertSort(field, name, direction);
    }
    // Focus once: consecutive Enter/Space presses must operate the same header.
    await button.focus();
    for (const [key, direction] of [['Enter', 'asc'], ['Space', 'desc'], ['Enter', 'asc'], ['Space', 'desc']]) {
      await page.keyboard.press(key);
      await assertSort(field, name, direction);
      assert(await button.evaluate((element) => element === document.activeElement), `${field}/${direction} lost keyboard focus`);
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await button.focus();
    await page.keyboard.press('Enter');
    await assertSort(field, name, 'asc');
    assert(await button.evaluate((element) => element === document.activeElement));
    checks.push(`${field}: dropdown/header bidirectional sync, ordered rows, repeated Enter/Space sorts, focus retention and page reset`);
  }
  await shot('table-sorting');
  // Use queries with more than one page so clamping cannot masquerade as reset.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('searchbox').fill('a');
  await page.getByText(/Page 1 of/).waitFor();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  for (const [group, option] of [['Jurisdiction', /Federal/], ['Policy type', /Guideline/], ['Status', /^Active/]]) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await choose(group, option);
    await page.getByText(/Page 1 of/).waitFor();
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
  }
  checks.push('Search and each filter group still reset pagination');
  await visible(
    page.getByRole('button', { name: 'List', exact: true }),
  ).click();
  checks.push(
    'Title sorting, pagination, reset on sort and all comparison-table sort columns',
  );

  await page
    .getByRole('combobox', { name: 'Sort policies' })
    .selectOption('effectiveDate:desc');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Light', 'Dark']) {
      await theme(name, width < 1024);
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow at ${width}/${name}`,
      );
      assert(await page.getByRole('searchbox').isVisible());
      assert(
        await page
          .getByRole('searchbox')
          .evaluate((e) => e.getBoundingClientRect().bottom < innerHeight),
      );
      if ([390, 1440].includes(width)) {
        await shot(
          `${width === 390 ? 'mobile' : 'desktop'}-${name.toLowerCase()}`,
        );
        await audit(`${width}-${name}`);
      }
    }
    checks.push(
      `${width}px: light/dark, search in first viewport, no horizontal overflow`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await theme('Light', true);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const mobile = page.getByRole('navigation', { name: 'Mobile' });
  for (const name of [
    'Register',
    'Developments',
    'Courts',
    'Timeline',
    'Network',
    'Methodology',
    'A2J',
    'API',
    'Feedback',
  ])
    assert(await mobile.getByRole('link', { name, exact: true }).isVisible());
  await shot('mobile-navigation');
  await audit('mobile-navigation');
  await page.keyboard.press('Escape');
  assert(
    await page
      .getByRole('button', { name: 'Open menu' })
      .evaluate((e) => e === document.activeElement),
  );
  const details = await openFilter('Jurisdiction');
  await shot('mobile-filters');
  await audit('mobile-filters');
  await details.locator('summary').focus();
  await page.keyboard.press('Escape');
  checks.push(
    'Mobile navigation destinations, filters, keyboard Escape and focus return',
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  const system = page.getByRole('radio', { name: 'System', exact: true });
  await system.click();
  await system.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page
      .getByRole('radio', { name: 'Dark', exact: true })
      .getAttribute('aria-checked'),
    'true',
  );
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await theme('Light', false);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('link', { name: 'Timeline', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert(
    await page
      .getByRole('button', { name: 'Explore', exact: true })
      .evaluate((e) => e === document.activeElement),
  );
  checks.push(
    'Theme arrow keys + persistence and Explore disclosure keyboard focus',
  );

  const source = visible(
    page.getByRole('link', { name: /^Official source for/ }),
  ).first();
  assert((await source.getAttribute('href')).startsWith('https://'));
  const record = visible(page.locator('#policy-register article h2 a')).first();
  const title = await record.innerText();
  await record.click();
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  await shot('record-detail');
  await audit('record-detail');
  for (const route of [
    '/developments',
    '/courts',
    '/timeline',
    '/network',
    '/methodology',
  ]) {
    assert.equal((await page.goto(`${url}${route}`)).status(), 200);
    await visible(page.locator('main h1')).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow on ${route}`,
    );
    if (route === '/developments' || route === '/courts') {
      await shot(route.slice(1));
      await audit(route);
    }
  }
  checks.push(
    'Official source, full record detail and all primary/explore internal routes load',
  );
  assert.deepEqual(errors, []);
  assert.equal(
    accessibility.flatMap((a) => a.violations).length,
    0,
    'Accessibility violations (see verification.json)',
  );
  passed = true;
} finally {
  writeFileSync(
    `${dir}/verification.json`,
    JSON.stringify(
      { passed, url, checks, errors, accessibility, screenshots },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        passed,
        checks: checks.length,
        errors,
        violations: accessibility.flatMap((a) => a.violations).length,
        evidence: dir,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
