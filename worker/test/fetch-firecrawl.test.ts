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

  it('rejects off-domain URLs where the pattern only matches a substring', () => {
    const md = `
[Legit budget story](https://clcs.org.au/news/budget-boost)
[Spoofed off-domain link](https://evil.example/clcs.org.au/news/x)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual(['https://clcs.org.au/news/budget-boost']);
  });

  it('still allows same-domain and subdomain URLs matching the pattern', () => {
    const md = `
[Same domain](https://clcs.org.au/news/budget-boost)
[Subdomain](https://press.clcs.org.au/news/launch)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual([
      'https://clcs.org.au/news/budget-boost',
      'https://press.clcs.org.au/news/launch',
    ]);
  });

  it('drops fragment-only links to the listing page itself', () => {
    const md = `
[Skip past the header](https://clcs.org.au/news#content)
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual(['https://clcs.org.au/news/budget-boost']);
  });

  it('strips fragments from item URLs', () => {
    const md = `[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost#summary)`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual(['https://clcs.org.au/news/budget-boost']);
  });

  it('skips static asset links and image-syntax titles', () => {
    const md = `
[![Pro Bono News banner](https://clcs.org.au/uploads/banner.png)](https://clcs.org.au/news/banner-post)
[A news masthead image](https://clcs.org.au/uploads/news.png)
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual(['https://clcs.org.au/news/budget-boost']);
  });

  it('skips navigation-noise link text', () => {
    const md = `
[Read more](https://clcs.org.au/news/budget-boost)
[See all closed consultations](https://clcs.org.au/news/archive)
[Subscribe to our newsletter east](https://clcs.org.au/news/newsletter)
[Make a Submission](https://clcs.org.au/news/submit)
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost-2026)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual(['https://clcs.org.au/news/budget-boost-2026']);
  });
});
