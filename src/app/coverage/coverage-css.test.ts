import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const COVERAGE_CSS = read('src/app/coverage/coverage.css');
const GLOBALS_CSS = read('src/app/globals.css');
const TOKENS_CSS = read('design/tokens.css');

const PHONE = '@media (max-width: 767px)';
const NARROW = '@media (min-width: 40rem)';

type Block = { prelude: string; body: string };

function blocks(css: string): Block[] {
  const found: Block[] = [];
  let depth = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') {
      if (depth === 0) {
        prelude = css.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        found.push({ prelude, body: css.slice(start, i) });
        start = i + 1;
      }
    }
  }
  return found;
}

function scope(css: string, atRules: string[]): string {
  return atRules.reduce((inner, rule) => {
    const match = blocks(inner).find((block) => block.prelude === rule);
    if (!match) throw new Error(`Missing ${rule}`);
    return match.body;
  }, css);
}

function declarations(css: string, selector: string, atRules: string[] = []): Record<string, string> {
  const found: Record<string, string> = {};
  for (const block of blocks(scope(css, atRules))) {
    if (!block.prelude.split(',').map((part) => part.trim()).includes(selector)) continue;
    for (const declaration of block.body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) found[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return found;
}

function tokenValue(name: string): string {
  const match = TOKENS_CSS.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing token ${name}`);
  return match[1].trim();
}

function pixels(expression: string, variables: Record<string, string>): number {
  const resolved = expression
    .replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, name: string, fallback?: string) => {
      const value = variables[name] ?? (name.startsWith('--space-') ? tokenValue(name) : fallback);
      if (value === undefined) throw new Error(`Unresolved ${name}`);
      return `(${pixels(value, variables)})`;
    })
    .replace(/calc\(/g, '(')
    .replace(/(-?[\d.]+)rem/g, '($1*16)')
    .replace(/(-?[\d.]+)px/g, '$1');
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) throw new Error(`Cannot evaluate ${expression}`);
  return Function(`return (${resolved})`)() as number;
}

function scrollClearance(width: 'phone' | 'wide'): string {
  const base = declarations(GLOBALS_CSS, 'html', ['@layer base'])['--scroll-clear-top'];
  const wide = declarations(GLOBALS_CSS, 'html', ['@layer base', NARROW])['--scroll-clear-top'];
  return width === 'phone' ? base : wide;
}

describe('coverage drill-down scroll offset', () => {
  const HEADER = 94;
  const STRIP = 45;
  const SCROLL_CLEAR = { phone: '6.5rem', wide: '9rem' } as const;

  it('pins --scroll-clear-top to 6.5rem and 9rem from the 40rem breakpoint', () => {
    expect(scrollClearance('phone')).toBe(SCROLL_CLEAR.phone);
    expect(scrollClearance('wide')).toBe(SCROLL_CLEAR.wide);
    expect(blocks(scope(GLOBALS_CSS, ['@layer base'])).some((block) => block.prelude === NARROW)).toBe(true);
  });

  it('lets the document scroll-padding and the row margin together land the row just below the header', () => {
    const gap = pixels('var(--space-2)', {});
    for (const width of ['phone', 'wide'] as const) {
      const html = declarations(GLOBALS_CSS, 'html', ['@layer base']);
      expect(html['scroll-padding-top']).toBe('var(--scroll-clear-top)');
      const variables = {
        '--scroll-clear-top': SCROLL_CLEAR[width],
        '--coverage-sticky-top': `${HEADER}px`,
        '--coverage-strip-height': `${STRIP}px`,
      };
      const margin = declarations(COVERAGE_CSS, '.coverage-drill-row', width === 'phone' ? [PHONE] : [])[
        'scroll-margin-top'
      ];
      const covered = width === 'phone' ? HEADER + STRIP : HEADER;
      expect(pixels(html['scroll-padding-top'], variables) + pixels(margin, variables)).toBe(covered + gap);
    }
  });

  it('adds the column strip to the clearance below 768px and nowhere else', () => {
    const phone = declarations(COVERAGE_CSS, '.coverage-drill-row', [PHONE])['scroll-margin-top'];
    const wide = declarations(COVERAGE_CSS, '.coverage-drill-row')['scroll-margin-top'];
    expect(phone).toContain('--coverage-strip-height');
    expect(wide).not.toContain('--coverage-strip-height');
    expect(wide).toContain('--coverage-sticky-top');
  });

  it('pins the column strip below the measured site header on phones', () => {
    expect(declarations(COVERAGE_CSS, '.coverage-table thead', [PHONE])).toMatchObject({
      position: 'sticky',
      top: 'var(--coverage-sticky-top, 0px)',
    });
  });
});

describe('coverage drill-down head', () => {
  it('stacks Clear selection under the heading so the floating scroll-to-top button cannot cover it', () => {
    expect(declarations(COVERAGE_CSS, '.coverage-drill-head')).toMatchObject({
      'flex-direction': 'column',
      'align-items': 'flex-start',
    });
    expect(declarations(COVERAGE_CSS, '.coverage-drill-head', [PHONE])['flex-direction']).toBeUndefined();
  });

  it('gives Clear selection a 44px minimum hit target', () => {
    expect(declarations(COVERAGE_CSS, '.coverage-clear')).toMatchObject({
      display: 'inline-flex',
      'align-items': 'center',
      'min-height': '2.75rem',
      'min-width': '2.75rem',
    });
  });
});
