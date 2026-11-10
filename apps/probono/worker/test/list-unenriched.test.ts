import { describe, expect, it } from 'vitest';
import { withPages, type UnenrichedItem } from '../src/list-unenriched.js';

const item = (id: number, excerpt: string | null): UnenrichedItem => ({
  id,
  title: `Item ${id}`,
  url: `https://example.org/${id}`,
  excerpt,
  published_at: null,
  source_name: 'Fixture',
  stream_hint: 'news',
});

describe('withPages', () => {
  it('reads the page only for items whose excerpt is thin', async () => {
    const fetched: string[] = [];
    const out = await withPages(
      [item(1, 'x'.repeat(400)), item(2, 'Short.'), item(3, null)],
      async (url) => {
        fetched.push(url);
        return url.endsWith('/2') ? { text: 'Page two.', via: 'direct' } : null;
      },
    );

    expect(fetched).toEqual(['https://example.org/2', 'https://example.org/3']);
    expect(out.map((i) => [i.id, i.page])).toEqual([
      [1, null],
      [2, { text: 'Page two.', via: 'direct' }],
      [3, null],
    ]);
  });
});
