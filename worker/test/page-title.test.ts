import { describe, expect, it } from 'vitest';
import { decodeEntities, extractPageTitle, mapWithConcurrency } from '../src/lib/page-title.js';
import { extractListingLinks, resolveSlugTitles } from '../src/lib/fetch-firecrawl.js';
import { isSlugDerived } from '../src/retitle.js';

const URL_ = 'https://www.maddocks.com.au/insights/native-title-future-acts';

describe('extractPageTitle', () => {
  it('prefers og:title, which publishers write without site furniture', () => {
    const html = `<head>
      <meta property="og:title" content="Yindjibarndi Ngurra Aboriginal Corporation v State of Western Australia (No 2) [2026] FCA 585">
      <title>Native title future acts | Maddocks</title>
    </head>`;
    expect(extractPageTitle(html, URL_)).toBe(
      'Yindjibarndi Ngurra Aboriginal Corporation v State of Western Australia (No 2) [2026] FCA 585',
    );
  });

  it('falls back to <title> and strips a site suffix matching the domain', () => {
    const html = '<title>Native title future acts and their implications | Maddocks</title>';
    expect(extractPageTitle(html, URL_)).toBe('Native title future acts and their implications');
  });

  it('strips a suffix matching og:site_name even when it is not the domain', () => {
    const html = `<meta property="og:site_name" content="Refugee Advice &amp; Casework Service">
      <title>RACS ambassador Shankari Chandran — Refugee Advice &amp; Casework Service</title>`;
    expect(extractPageTitle(html, 'https://racs.org.au/news/racs-ambassador-shankari-chandran'))
      .toBe('RACS ambassador Shankari Chandran');
  });

  it('keeps a pipe that belongs to the headline', () => {
    const html = '<title>Legal aid | the case for reform</title>';
    expect(extractPageTitle(html, 'https://example.org/news/x')).toBe(
      'Legal aid | the case for reform',
    );
  });

  it('never strips a title down to nothing', () => {
    const html = '<title>News | Maddocks</title>';
    // "News" is junk and too short to stand alone, so nothing is returned
    // rather than a worse title than the slug we already have.
    expect(extractPageTitle(html, URL_)).toBeNull();
  });

  it('rejects interstitial and error-page boilerplate', () => {
    expect(extractPageTitle('<title>Just a moment...</title>', URL_)).toBeNull();
    expect(extractPageTitle('<title>Page not found - Maddocks</title>', URL_)).toBeNull();
  });

  it('uses <h1> only when the head offers nothing', () => {
    const html = '<h1>Prisoners need urgent access to lawyers</h1>';
    expect(extractPageTitle(html, URL_)).toBe('Prisoners need urgent access to lawyers');
  });

  it('reads content regardless of attribute order or quoting', () => {
    const html = `<meta content='Submission: review of the Anti-Discrimination Act 1977 (NSW)' property="og:title">`;
    expect(extractPageTitle(html, URL_)).toBe(
      'Submission: review of the Anti-Discrimination Act 1977 (NSW)',
    );
  });

  it('returns null when there is no title at all', () => {
    expect(extractPageTitle('<html><body><p>hi</p></body></html>', URL_)).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex references', () => {
    expect(decodeEntities('Australia&#39;s &amp; NSW&#8217;s &#x201C;gap&#x201D;')).toBe(
      'Australia\'s & NSW’s “gap”',
    );
  });

  it('leaves unknown and out-of-range references alone', () => {
    expect(decodeEntities('a &notreal; b &#x110000;')).toBe('a &notreal; b &#x110000;');
  });
});

describe('resolveSlugTitles', () => {
  const MD = `
[](https://clcs.org.au/news/building-confidence-courtroom-one-volunteer-time)
[Sector snapshot 2026](https://clcs.org.au/news/sector-snapshot-2026)
`;

  it('replaces only slug-derived titles, leaving link-text titles untouched', async () => {
    const items = extractListingLinks(MD, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items.map((i) => i.title_from_slug)).toEqual([true, false]);

    const resolved = await resolveSlugTitles(items, async () =>
      'Building confidence in the courtroom, one volunteer at a time',
    );
    expect(resolved[0].title).toBe('Building confidence in the courtroom, one volunteer at a time');
    expect(resolved[1].title).toBe('Sector snapshot 2026');
  });

  it('keeps the slug title when the page will not answer', async () => {
    const items = extractListingLinks(MD, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    const resolved = await resolveSlugTitles(items, async () => null);
    expect(resolved[0].title).toBe('Building confidence courtroom one volunteer time');
  });
});

describe('isSlugDerived', () => {
  it('recognises a title that re-derives from its own URL', () => {
    expect(
      isSlugDerived(
        'https://clcs.org.au/news/building-confidence-courtroom-one-volunteer-time',
        'Building confidence courtroom one volunteer time',
      ),
    ).toBe(true);
  });

  it('tolerates titles stored before the acronym restore landed', () => {
    expect(
      isSlugDerived('https://example.org/news/un-arbitrary-detention-report', 'Un arbitrary detention report'),
    ).toBe(true);
  });

  it("leaves a publisher's own lowercase headline alone", () => {
    expect(
      isSlugDerived(
        'https://clcs.org.au/news/budget-boost',
        'Law reform built without evidence is fundamentally flawed',
      ),
    ).toBe(false);
  });

  it('no longer matches once the title has been repaired', () => {
    expect(
      isSlugDerived(
        'https://clcs.org.au/news/building-confidence-courtroom-one-volunteer-time',
        'Building confidence in the courtroom, one volunteer at a time',
      ),
    ).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and never exceeds the cap', async () => {
    let live = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
