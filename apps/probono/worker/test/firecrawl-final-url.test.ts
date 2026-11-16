import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFirecrawl } from '../src/lib/fetch-firecrawl.js';
import { fetchPageTitleViaFirecrawl } from '../src/lib/page-title.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const scrape = (data: Record<string, unknown>) =>
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const PUBLIC = { sourceURL: 'https://1.1.1.1/news', url: 'https://1.0.0.1/news/' };
const PRIVATE = { sourceURL: 'https://1.1.1.1/news', url: 'http://169.254.169.254/latest/meta-data' };

describe('fetchFirecrawl', () => {
  const markdown = '[Federal budget boosts legal aid](https://1.1.1.1/news/budget-boost)';
  const pattern = '1\\.1\\.1\\.1/news/.+';

  it('returns the listing links when the scrape landed on a public address', async () => {
    scrape({ markdown, metadata: PUBLIC });
    expect(await fetchFirecrawl('https://1.1.1.1/news', pattern)).toMatchObject([
      { url: 'https://1.1.1.1/news/budget-boost', title: 'Federal budget boosts legal aid' },
    ]);
  });

  it('refuses a listing whose scrape landed on a private address', async () => {
    scrape({ markdown, metadata: PRIVATE });
    await expect(fetchFirecrawl('https://1.1.1.1/news', pattern)).rejects.toThrow(/non-public address/);
  });

  it('refuses a listing whose scrape does not say where it landed', async () => {
    scrape({ markdown });
    await expect(fetchFirecrawl('https://1.1.1.1/news', pattern)).rejects.toThrow(/no final URL/);
  });
});

describe('fetchPageTitleViaFirecrawl', () => {
  const url = 'https://1.1.1.1/news/new-resources-corporate-lawyers';
  const rawHtml = '<title>New resources for corporate lawyers</title>';

  it('returns the headline when the scrape landed on a public address', async () => {
    scrape({ rawHtml, metadata: { sourceURL: url, url } });
    expect(await fetchPageTitleViaFirecrawl(url)).toBe('New resources for corporate lawyers');
  });

  it('returns no headline when the scrape landed on a private address', async () => {
    scrape({ rawHtml, metadata: { sourceURL: url, url: 'http://10.0.0.5/news/new-resources-corporate-lawyers' } });
    expect(await fetchPageTitleViaFirecrawl(url)).toBeNull();
  });
});
