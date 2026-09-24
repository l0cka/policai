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
    const editorial = await readApp('editorial.css');
    const visible = editorial.match(/\.hero-search input:focus-visible\s*\{[^}]*\}/);
    assert.ok(visible, ':focus-visible rule exists in editorial.css');
    assert.match(visible[0], /--focus-ring-width/);
    assert.match(visible[0], /--focus-ring-color/);
    const focusRule = editorial.match(/\.hero-search input:focus\s*\{[^}]*\}/);
    assert.ok(focusRule);
    assert.doesNotMatch(focusRule[0], /outline/);
    const globals = await readApp('globals.css');
    const globalsFocus = globals.match(/\.hero-search input:focus\s*\{[^}]*\}/);
    assert.ok(globalsFocus);
    assert.doesNotMatch(globalsFocus[0], /outline:/);
  });
});