import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * Static accessibility-structure tests: the dashboard has no component-test
 * runtime (plain node --test, no Testing Library), so the description-list
 * and tablist invariants are asserted directly on the source markup.
 */

const appDir = new URL('../app/', import.meta.url).pathname;

const readApp = (file) => readFile(appDir + file, 'utf8');

describe('stat-strip description lists', () => {
  const pages = [
    'page.tsx',
    'signal-network.tsx',
    'health/page.tsx',
    'sector/page.tsx',
  ];

  for (const page of pages) {
    it(`${page}: every dl group is dt-then-dd`, async () => {
      const source = await readApp(page);
      const blocks = source.match(/<dl[\s\S]*?<\/dl>/g) ?? [];
      assert.ok(blocks.length > 0, `${page} should still have description lists`);
      for (const block of blocks) {
        const groups = block.match(/<div[^>]*>([\s\S]*?)<\/div>/g) ?? [];
        for (const group of groups) {
          const dt = group.indexOf('<dt');
          const dd = group.indexOf('<dd');
          if (dt === -1 && dd === -1) continue; // non-dl div nested inside
          assert.ok(dt !== -1 && dd !== -1, `group is missing dt or dd in ${page}`);
          assert.ok(dt < dd, `dd precedes dt in ${page}: ${group.slice(0, 80)}`);
        }
      }
    });
  }

  it('globals.css keeps the number-above visual in CSS, not markup', async () => {
    const css = await readApp('globals.css');
    const ruleMatches = (selector, pattern) => {
      const rules = [...css.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'g'))];
      return rules.some((rule) => pattern.test(rule[0]));
    };
    for (const selector of ['.observatory-stats > div', '.signal-network-summary > div']) {
      assert.ok(ruleMatches(selector, /flex-direction:\s*column-reverse/), `${selector} has a column-reverse rule`);
    }
    assert.ok(ruleMatches('.stat', /flex-direction:\s*row-reverse/));
  });
});

describe('sector view tablist', () => {
  it('tabs expose ids, aria-controls and a roving tabindex', async () => {
    const source = await readApp('sector-explorer.tsx');
    for (const view of ['map', 'system']) {
      assert.match(source, new RegExp(`id="sector-view-tab-${view}"`));
      assert.match(source, new RegExp(`aria-controls="sector-view-panel-${view}"`));
      assert.match(source, new RegExp(`id="sector-view-panel-${view}"`));
      assert.match(source, new RegExp(`aria-labelledby="sector-view-tab-${view}"`));
      assert.match(source, new RegExp(`tabIndex=\\{view === '${view}' \\? 0 : -1\\}`));
    }
    assert.match(source, /role="tablist"/);
    assert.match(source, /ArrowRight/);
    assert.match(source, /selection follows focus|selection-follows-focus|arrows move both/);
  });
});

describe('sector map accessibility', () => {
  it('state label markers are real buttons with an accessible name', async () => {
    const source = await readApp('sector-map-view.tsx');
    const markerBlock = source.match(/for \(const \[code, point\] of Object\.entries\(STATE_LABEL_POINTS\)\)[\s\S]*?stateMarkersRef\.current\[code\] = marker;/);
    assert.ok(markerBlock, 'state-label marker block exists');
    assert.match(markerBlock[0], /document\.createElement\('button'\)/);
    assert.match(markerBlock[0], /aria-label/);
  });

  it('map camera animations honour prefers-reduced-motion', async () => {
    const source = await readApp('sector-map-view.tsx');
    assert.match(source, /prefers-reduced-motion: reduce/);
    const animatedCalls = [
      ...source.matchAll(/map\.(easeTo|fitBounds|flyTo)\(/g),
    ].length;
    const gated = [...source.matchAll(/duration: reducedMotion\(\) \? 0 : undefined/g)].length;
    assert.ok(animatedCalls >= 4, `expected 4 animated camera calls, found ${animatedCalls}`);
    assert.equal(gated, animatedCalls, 'every animated camera call passes a reduced-motion duration');
  });
});

describe('hero search focus ring', () => {
  it('is consolidated on :focus-visible with the shared tokens', async () => {
    const css = await readApp('globals.css');
    const visible = css.match(/\.hero-search input:focus-visible\s*\{[^}]*\}/);
    assert.ok(visible, ':focus-visible rule exists in globals.css');
    assert.match(visible[0], /--focus-ring-width/);
    assert.match(visible[0], /--focus-ring-color/);
    const focusRules = [...css.matchAll(/\.hero-search input:focus\s*\{[^}]*\}/g)];
    assert.equal(focusRules.length, 1, 'one .hero-search input:focus rule');
    assert.doesNotMatch(focusRules[0][0], /outline/);
  });
});

const cssRules = (css) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    body: match[2],
  }));

describe('search inputs', () => {
  const inputs = ['.sector-search input', '.radar-search input', '.hero-search input'];

  it('share one rule for border, radius and minimum height', async () => {
    const rules = cssRules(await readApp('globals.css'));
    const shared = rules.filter((rule) => inputs.every((input) => rule.selectors.includes(input)));
    assert.equal(shared.length, 1, 'one rule lists all three search inputs');
    assert.match(shared[0].body, /border:\s*1px solid var\(--input\)/);
    assert.match(shared[0].body, /border-radius:\s*var\(--radius-control\)/);
    assert.match(shared[0].body, /min-height:\s*var\(--touch-target\)/);
    const own = rules.filter((rule) => rule.selectors.length === 1 && inputs.some((input) => rule.selectors[0].startsWith(input)));
    for (const rule of own) {
      assert.doesNotMatch(rule.body, /border|background|box-shadow/, `${rule.selectors[0]} leaves the box to the shared rule`);
    }
  });

  it('show focus with the shared outline and no box-shadow ring', async () => {
    const rules = cssRules(await readApp('globals.css'));
    const searchRules = rules.filter((rule) => rule.selectors.some((selector) => /search input/.test(selector)));
    for (const rule of searchRules) {
      assert.doesNotMatch(rule.body, /box-shadow/, `${rule.selectors.join(', ')} draws no box-shadow`);
    }
    const visible = rules.filter((rule) => inputs.every((input) => rule.selectors.includes(`${input}:focus-visible`)));
    assert.equal(visible.length, 1, 'one :focus-visible rule lists all three search inputs');
    assert.match(visible[0].body, /--focus-ring-width/);
    assert.match(visible[0].body, /--focus-ring-color/);
  });
});

describe('selected controls', () => {
  it('tabs, relationship chips and the theme toggle use the selected-control tokens', async () => {
    const rules = cssRules(await readApp('globals.css'));
    for (const selector of [
      ".theme-toggle button[aria-checked='true']",
      ".sector-view-tabs button[aria-selected='true']",
      ".sector-relationship-chips button[aria-pressed='true']",
    ]) {
      const rule = rules.find((candidate) => candidate.selectors.includes(selector));
      assert.ok(rule, `${selector} rule exists`);
      assert.match(rule.body, /background:\s*var\(--selected-bg\)/, `${selector} fill`);
      assert.match(rule.body, /color:\s*var\(--selected-fg\)/, `${selector} text`);
      assert.doesNotMatch(rule.body, /--status-/, `${selector} uses no status colour`);
    }
  });

  it('the theme toggle moves to the first and last option with Home and End', async () => {
    const source = await readApp('theme-toggle.tsx');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      assert.match(source, new RegExp(`\\b${key}\\b`), `${key} is handled`);
    }
  });
});

describe('sector category colours', () => {
  const categories = ['legal_aid', 'clc', 'wls', 'atsils', 'fvpls'];

  it('the legend and the map markers read the same --cat-* tokens', async () => {
    const css = await readApp('globals.css');
    const rules = cssRules(css);
    for (const category of categories) {
      assert.match(css, new RegExp(`--cat-${category}:`), `--cat-${category} is declared`);
      const dot = rules.find((rule) => rule.selectors.includes(`.sector-key-${category}`));
      assert.ok(dot, `.sector-key-${category} rule exists`);
      assert.match(dot.body, new RegExp(`background:\\s*var\\(--cat-${category}\\)`));
    }
    const source = await readApp('sector-map-view.tsx');
    assert.match(source, /var\(--cat-\$\{/, 'the map resolves the tokens');
    assert.doesNotMatch(source, /clc:\s*'#/, 'the map holds no second colour table');
  });

  it('the map resolves a missing style image', async () => {
    const source = await readApp('sector-map-view.tsx');
    assert.match(source, /map\.setMissingStyleImageResolver\(/);
  });
});