import { describe, expect, it } from 'vitest';
import { cleanListingTitle } from '../src/lib/listing-title.js';
import { extractListingLinks } from '../src/lib/fetch-firecrawl.js';

describe('cleanListingTitle', () => {
  it('keeps the heading line of a multi-line card link', () => {
    expect(
      cleanListingTitle(
        'PRF News\\ \\ \\ \\ August 27, 2026\\ \\ August 27, 2026\\ \\ ##### PRF seeking experienced consultant for a Request for Services on a Data & AI Fund',
      ),
    ).toBe('PRF seeking experienced consultant for a Request for Services on a Data & AI Fund');
  });

  it('drops the category label, date and teaser around a heading', () => {
    expect(
      cleanListingTitle(
        'Legal development\\ \\ \\ \\ ### A free for all? Consultation opens on new laws\\ September 11, 2026\\ Discover more',
      ),
    ).toBe('A free for all? Consultation opens on new laws');
  });

  it('falls back to the longest non-date line when there is no heading', () => {
    expect(cleanListingTitle('News\\ 3 September 2026\\ Community legal centres welcome new funding')).toBe(
      'Community legal centres welcome new funding',
    );
  });

  it('strips a lone leading heading marker', () => {
    expect(cleanListingTitle('## Justice Connect annual report')).toBe('Justice Connect annual report');
  });

  it('leaves ordinary titles alone', () => {
    expect(cleanListingTitle('  Harvey  launches pro bono program ')).toBe('Harvey launches pro bono program');
    expect(cleanListingTitle('C# for lawyers: a primer')).toBe('C# for lawyers: a primer');
  });
});

describe('extractListingLinks with card markup', () => {
  it('stores the cleaned heading as the item title', () => {
    const md = '[PRF News\\\n\\\nAugust 27, 2026\\\n\\\n##### PRF seeking a consultant for the Data Fund](https://example.org/news/prf-consultant)';
    const [item] = extractListingLinks(md, 'https://example.org/news', 'example\\.org/news/.+');
    expect(item.title).toBe('PRF seeking a consultant for the Data Fund');
  });
});
