import { describe, expect, it } from 'vitest';
import { extractListingLinks } from '../src/lib/fetch-firecrawl.js';

const MD = `
# News
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost)
[About us](https://clcs.org.au/about)
[Sector snapshot 2026](/news/sector-snapshot-2026)
[Donate](https://donate.example.org/clcs)
`;

describe('extractListingLinks', () => {
  it('keeps only links matching item_link_pattern, resolves relative URLs', () => {
    const items = extractListingLinks(MD, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items.map((i) => i.url)).toEqual([
      'https://clcs.org.au/news/budget-boost',
      'https://clcs.org.au/news/sector-snapshot-2026',
    ]);
    expect(items[0].title).toBe('Federal budget boosts legal aid');
    expect(items[0].excerpt).toBeNull();
  });
});
