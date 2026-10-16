import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileMDX } from 'next-mdx-remote/rsc';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import path from 'path';
import { readArticleSources } from './articles';
import { validateArticles } from './validate-data';
import { articleMdxOptions } from './article-markdown';
import { ArticleTable } from '@/components/article-table';
import { buildPolicy } from '@/test/factories';

const FIXTURES = path.join(process.cwd(), 'src/test/fixtures/articles');

async function render(source: string, mdxOptions: object, withTable = false) {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions },
    components: withTable ? { table: ArticleTable } : {},
  });
  return renderToStaticMarkup(createElement('div', null, content));
}

async function fixtureSource(slug: string) {
  const found = (await readArticleSources(FIXTURES)).find((entry) => entry.slug === slug);
  if (!found) throw new Error(`missing fixture ${slug}`);
  return found;
}

describe('article markdown tables', () => {
  it('renders pipe tables with thead, th and td inside a focusable scroll region', async () => {
    const { source } = await fixtureSource('fixture-tables-published');
    const html = await render(matter(source).content, articleMdxOptions, true);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    expect(tables).toHaveLength(2);
    const wide = tables[1];
    expect(wide.querySelectorAll('thead th')).toHaveLength(6);
    expect(wide.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(wide.querySelectorAll('tbody td')).toHaveLength(12);
    const region = wide.parentElement!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('aria-label')).toBe('Table');
  });

  it('leaves pipe tables as paragraphs without the plugin', async () => {
    const { source } = await fixtureSource('fixture-tables-published');
    const html = await render(matter(source).content, { format: 'md' });
    expect(html).not.toContain('<table');
  });

  it('keeps other GFM syntax inert', async () => {
    const html = await render('~~gone~~ https://example.com [^1]\n\n- [ ] task\n', articleMdxOptions);
    expect(html).not.toMatch(/<(del|a|input|section)\b/);
  });

  it('renders every other fixture identically with and without the table plugin', async () => {
    const others = (await readArticleSources(FIXTURES)).filter(
      (entry) => entry.slug !== 'fixture-tables-published',
    );
    expect(others.length).toBeGreaterThan(5);
    for (const entry of others) {
      const body = matter(entry.source).content;
      expect(await render(body, articleMdxOptions), entry.slug).toBe(await render(body, { format: 'md' }));
    }
  });
});

describe('table cell links', () => {
  const policy = buildPolicy({ id: 'fixture-current' });
  const targets = { images: new Map(), policies: [policy], publicPolicies: [policy] };

  it('validates a link inside a table cell like any body link', async () => {
    const entry = await fixtureSource('fixture-tables-published');
    expect(validateArticles([entry], [], targets)).toEqual({ errors: [], warnings: [] });
    const unlisted = {
      ...entry,
      source: entry.source.replace(
        'https://www.example.gov.au/fixture-instrument).',
        'https://www.example.gov.au/other).',
      ),
    };
    expect(validateArticles([unlisted], [], targets).errors).toEqual([
      expect.stringContaining('body links https://www.example.gov.au/other but sources does not list it'),
    ]);
  });
});
