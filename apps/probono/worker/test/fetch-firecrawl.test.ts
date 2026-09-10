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

  it('skips links pointing at static assets, keeps image-only anchors via slug titles', () => {
    const md = `
[![Pro Bono News banner](https://clcs.org.au/uploads/banner.png)](https://clcs.org.au/news/annual-report-launch)
[A news masthead image](https://clcs.org.au/uploads/news.png)
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual([
      'https://clcs.org.au/news/annual-report-launch',
      'https://clcs.org.au/news/budget-boost',
    ]);
    expect(items[0].title).toBe('Annual report launch');
  });

  it('extracts card-style links with a nested image inside the anchor', () => {
    const md = `[![News thumbnail](https://clcs.org.au/uploads/thumb.jpg)\\
\\
Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost)`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://clcs.org.au/news/budget-boost');
    expect(items[0].title).toBe('Federal budget boosts legal aid');
  });

  it('derives a title from the slug for empty image-only anchors', () => {
    const md = `
[](https://clcs.org.au/news/administrative-review-bill-2026)
[](https://clcs.org.au/tags/news)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://clcs.org.au/news/administrative-review-bill-2026');
    expect(items[0].title).toBe('Administrative review bill 2026');
  });

  it('survives malformed percent-encoding in an empty-anchor slug', () => {
    const md = `
[](https://clcs.org.au/news/broken-encoding-%E0%A4%A)
[](https://clcs.org.au/news/administrative-review-bill-2026)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items.map((i) => i.title)).toEqual([
      'Broken encoding %E0%A4%A',
      'Administrative review bill 2026',
    ]);
  });

  it('strips markdown heading prefixes and trailing separator junk from titles', () => {
    const md = `
[### Administrative Review Council Inquiry](https://clcs.org.au/news/arc-inquiry)
[NDIS reforms\\ ----------------](https://clcs.org.au/news/ndis-reforms)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items[0].title).toBe('Administrative Review Council Inquiry');
    expect(items[1].title).toBe('NDIS reforms');
  });

  it('skips navigation-noise link text', () => {
    const md = `
[See all closed consultations](https://clcs.org.au/news/archive)
[Subscribe to our newsletter east](https://clcs.org.au/news/newsletter)
[Make a Submission](https://clcs.org.au/news/submit)
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost-2026)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/.+');
    expect(items.map((i) => i.url)).toEqual(['https://clcs.org.au/news/budget-boost-2026']);
  });

  it('keeps teaser-button links, titling them from the slug', () => {
    const md = `
[READ MORE](https://clcs.org.au/news/no-air-in-prison-bill)
[Find out more](https://clcs.org.au/news/ekka-show-day-closures)
[Read more](https://clcs.org.au/donate-now)
`;
    const items = extractListingLinks(md, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items.map((i) => i.title)).toEqual([
      'No air in prison bill',
      'Ekka show day closures',
    ]);
  });
});
