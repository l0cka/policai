import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs
  .readFileSync(path.resolve(__dirname, '../globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function selectors(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (prelude.startsWith('@')) continue;
    found.push(...prelude.split(',').map((part) => part.trim()));
  }
  return found;
}

const TABLE_ELEMENT = /(^|[\s>+~(])(table|thead|tbody|tr|th|td)(?![\w-])/;

describe('prose table styles', () => {
  const all = selectors(css);

  it('are owned by .article-table-scroll', () => {
    const prose = all.filter((selector) => selector.includes('.article-table-scroll'));
    expect(prose.length).toBeGreaterThan(0);
    for (const selector of prose) {
      expect(selector.startsWith('.article-table-scroll')).toBe(true);
    }
  });

  it('never reach figure tables through .article-body', () => {
    const leaks = all.filter(
      (selector) =>
        selector.includes('.article-body') &&
        !selector.includes('.article-table-scroll') &&
        !selector.includes('.figure') &&
        TABLE_ELEMENT.test(selector.replace(/:is\([^)]*\)/g, '')),
    );
    expect(leaks).toEqual([]);
  });
});
