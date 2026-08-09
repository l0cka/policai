import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coversSlug,
  decodeEntities,
  extractPageTitle,
  fetchPageTitle,
  mapWithConcurrency,
  slugWords,
} from '../src/lib/page-title.js';
import { countRepeats, extractListingLinks, resolveSlugTitles } from '../src/lib/fetch-firecrawl.js';
import { isSlugDerived } from '../src/retitle.js';

/*
 * The item that prompted this module. A slug is built from the headline, so a
 * fixture URL and its title have to correspond — the coverage check depends on
 * exactly that relationship.
 */
const URL_ =
  'https://www.maddocks.com.au/insights/native-title-future-acts-and-the-implications-of-yindjibarndi-ngurra-aboriginal-corporation-v-state-of-western-australia-no-2-2026-fca-585';
const HEADLINE =
  'Native title future acts and the implications of Yindjibarndi Ngurra Aboriginal Corporation v State of Western Australia (No 2) [2026] FCA 585';
// How Maddocks actually sets it, recovered from the page's <h1>.
const HEADLINE_CASED =
  'Native Title, Future Acts and the implications of Yindjibarndi Ngurra Aboriginal Corporation v State of Western Australia (No 2) [2026] FCA 585';

describe('extractPageTitle', () => {
  it('prefers og:title, which publishers write without site furniture', () => {
    const html = `<head>
      <meta property="og:title" content="${HEADLINE}">
      <title>${HEADLINE} | Maddocks</title>
    </head>`;
    expect(extractPageTitle(html, URL_)).toBe(HEADLINE);
  });

  it('restores the case a slug flattened, which is the whole point', () => {
    const html = `<title>${HEADLINE} | Maddocks</title>`;
    const stored =
      'Native title future acts and the implications of yindjibarndi ngurra aboriginal corporation v state of western australia no 2 2026 fca 585';
    expect(isSlugDerived(URL_, stored)).toBe(true);
    expect(extractPageTitle(html, URL_)).toBe(HEADLINE);
  });

  it('strips the site suffix from og:title too, when the CMS put one there', () => {
    const html = `<meta property="og:title" content="Federal Budget misses opportunity to unlock billions | Justice Connect">`;
    expect(extractPageTitle(html, 'https://justiceconnect.org.au/news/federal-budget')).toBe(
      'Federal Budget misses opportunity to unlock billions',
    );
  });

  it('falls back to <title> and strips a site suffix matching the domain', () => {
    const html = '<title>Native title future acts and their implications | Maddocks</title>';
    const url = 'https://www.maddocks.com.au/insights/native-title-future-acts-and-their-implications';
    expect(extractPageTitle(html, url)).toBe('Native title future acts and their implications');
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
    expect(extractPageTitle(html, 'https://example.org/news/prisoners-need-access-lawyers')).toBe(
      'Prisoners need urgent access to lawyers',
    );
  });

  it('reads content regardless of attribute order or quoting', () => {
    const html = `<meta content='Submission: review of the Anti-Discrimination Act 1977 (NSW)' property="og:title">`;
    expect(
      extractPageTitle(html, 'https://example.org/news/submission-review-anti-discrimination-act-1977-nsw'),
    ).toBe('Submission: review of the Anti-Discrimination Act 1977 (NSW)');
  });

  it('returns null when there is no title at all', () => {
    expect(extractPageTitle('<html><body><p>hi</p></body></html>', URL_)).toBeNull();
  });

  /*
   * Each of these was found by dry-running the backfill over the live table;
   * every one of them replaced a lossy title with a worse one.
   */
  describe('candidates the slug proves wrong', () => {
    const census =
      'https://www.maddocks.com.au/insights/maddocks-supports-australian-bureau-of-statistics-with-2026-census';

    it('rejects a title the CMS truncated for sharing', () => {
      const html =
        '<meta property="og:title" content="Maddocks supports Australian Bureau of Statistics with privacy…">';
      // The slug still knows the sentence ended in "census".
      expect(extractPageTitle(html, census)).toBeNull();
    });

    it('rejects a page that answers with its own name', () => {
      const html = '<title>Legal Aid Queensland</title>';
      expect(
        extractPageTitle(html, 'https://legalaid.qld.gov.au/news/brisbane-ekka-show-day-closures'),
      ).toBeNull();
    });

    it('rejects a page whose content has moved on since we linked it', () => {
      const html = '<title>Statement of Rights Webinar Event</title>';
      expect(
        extractPageTitle(html, 'https://example.org/news/advocates-call-out-guardianship-misuse'),
      ).toBeNull();
    });

    it('drops a site suffix the head already makes redundant, without a name match', () => {
      const html = "<title>Update on the sexual assault legal service - Women’s Legal Centre</title>";
      expect(
        extractPageTitle(html, 'https://wlc.org.au/news/update-on-the-sexual-assault-legal-service'),
      ).toBe('Update on the sexual assault legal service');
    });

    it('trims a dangling separator left by an empty site name', () => {
      const html = '<title>Community forum on family violence |</title>';
      expect(
        extractPageTitle(html, 'https://example.org/events/community-forum-on-family-violence'),
      ).toBe('Community forum on family violence');
    });

    it('checks the slug we asked for, not the root a dead article redirects to', () => {
      const html = '<title>Community Legal Centres Queensland</title>';
      const asked = 'https://communitylegalqld.org.au/news/what-to-do-if-you-need-help-over-the-holiday-season/';
      expect(extractPageTitle(html, asked, 'https://www.clcq.org.au/')).toBeNull();
    });

    it('strips stacked site furniture, not just the last segment', () => {
      // RACS ends every title "… — RACS | Refugee Advice & Casework Service".
      const html = `<meta property="og:site_name" content="RACS &#124; Refugee Advice &amp; Casework Service">
        <title>Author Shankari Chandran announced as RACS Ambassador &mdash; RACS | Refugee Advice &amp; Casework Service</title>`;
      expect(
        extractPageTitle(html, 'https://www.racs.org.au/news/racs-ambassador-shankari-chandran'),
      ).toBe('Author Shankari Chandran announced as RACS Ambassador');
    });

    it('keeps the whole sentences of a title that trails off', () => {
      const html =
        '<meta property="og:title" content="Will you be caught by an expanded SOCI for a new era? Your chance to…">';
      expect(
        extractPageTitle(html, 'https://www.maddocks.com.au/insights/will-you-be-caught-by-an-expanded-soci-for-a-new-era'),
      ).toBe('Will you be caught by an expanded SOCI for a new era?');
    });

    it('rejects a trailing-off title with no whole sentence to keep', () => {
      const html = '<meta property="og:title" content="Maddocks supports Australian Bureau of…">';
      expect(extractPageTitle(html, census)).toBeNull();
    });

    it('decodes double-encoded entities a CMS left in the title', () => {
      const html = '<title>Aunty McRose available for comment on North West Gas Shelf approval&amp;nbsp;</title>';
      expect(
        extractPageTitle(html, 'https://www.gratafund.org.au/north-west-gas-shelf-approval'),
      ).toBe('Aunty McRose available for comment on North West Gas Shelf approval');
    });

    /*
     * Maddocks truncates both <title> and og:title for sharing and keeps the
     * whole headline only in the <h1> — the exact shape behind the screenshot
     * that started this. Neither truncated form ends in a sentence, so both
     * are dropped and the <h1> is what answers.
     */
    it('falls through two truncated candidates to the h1 that has it all', () => {
      const html = `<head>
        <title>Maddocks | Native Title, Future Acts and the implications of…</title>
        <meta property="og:title" content="Native Title, Future Acts and the implications of Yindjibarndi Ngurra…">
        </head><body><h1>${HEADLINE_CASED}</h1>`;
      expect(extractPageTitle(html, URL_)).toBe(HEADLINE_CASED);
    });

    /*
     * Some sites file a piece under a hand-written handle rather than a slug
     * generated from its headline. Holding those to coverage keeps a label
     * that can actively mislead — "Ban mass protests" reads as if Grata wants
     * protests banned.
     */
    it('accepts a headline that a hand-written handle shares no words with', () => {
      const html =
        '<title>Minns attempt to outlaw protest and usurp the courts will make us all unsafe</title>';
      expect(extractPageTitle(html, 'https://www.gratafund.org.au/ban_mass_protests')).toBe(
        'Minns attempt to outlaw protest and usurp the courts will make us all unsafe',
      );
    });

    it('still holds a generated slug to coverage, however tempting the answer', () => {
      // Four significant words: long enough to have been generated.
      const html = '<title>Statement of Rights Webinar Event</title>';
      expect(
        extractPageTitle(html, 'https://example.org/news/advocates-call-out-guardianship-misuse'),
      ).toBeNull();
    });

    it('holds even a short handle to coverage once the request has moved', () => {
      const html = '<title>Community Legal Centres Queensland</title>';
      expect(
        extractPageTitle(html, 'https://communitylegalqld.org.au/news/wunya-2026', 'https://www.clcq.org.au/'),
      ).toBeNull();
    });

    it('rejects a bare site name reached without any redirect', () => {
      const html = '<title>Legal Aid Queensland</title>';
      expect(extractPageTitle(html, 'https://legalaid.qld.gov.au/news/ekka-closures')).toBeNull();
    });

    it('matches across punctuation the slug could not carry', () => {
      const html = '<meta property="og:title" content="Updated guidance on non-disclosure agreements">';
      // slug word "disclosure" vs "non-disclosure"; "vlsbc" vs "VLSB+C".
      expect(
        extractPageTitle(html, 'https://example.org/news/updated-guidance-non-disclosure-agreements'),
      ).toBe('Updated guidance on non-disclosure agreements');
      expect(
        extractPageTitle(
          '<title>VLSB+C statement: Gold Migration Lawyers</title>',
          'https://example.org/news/vlsbc-statement-gold-migration-lawyers',
        ),
      ).toBe('VLSB+C statement: Gold Migration Lawyers');
    });
  });
});

describe('coversSlug', () => {
  it('is satisfied when every significant slug word survives', () => {
    expect(coversSlug('New Act to restrict use of NDAs in workplace matters', ['restrict', 'ndas', 'workplace', 'matters'])).toBe(true);
  });

  it('fails on a single missing word', () => {
    expect(coversSlug('Students are improving justice outcomes', ['student', 'criminal'])).toBe(false);
  });

  it('accepts anything when the slug carries no significant words', () => {
    expect(coversSlug('Who we are', slugWords('https://example.org/who-we-are'))).toBe(true);
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

describe('countRepeats', () => {
  it('flags a title proposed for more than one item', () => {
    const repeats = countRepeats([
      'Community Legal Centres Queensland',
      'Minns attempt to outlaw protest',
      'Community Legal Centres Queensland',
      null,
    ]);
    expect([...repeats]).toEqual(['Community Legal Centres Queensland']);
  });

  it('leaves unique titles and nulls alone', () => {
    expect([...countRepeats(['a headline', 'another headline', null, null])]).toEqual([]);
  });
});

describe('resolveSlugTitles, on a listing that answers with its own name', () => {
  it('keeps both slug titles rather than filing two items under one headline', async () => {
    const md = `
[](https://clcq.org.au/news/wunya-2026)
[](https://clcq.org.au/news/advocating-for-autonomy-and-independence)
`;
    const items = extractListingLinks(md, 'https://clcq.org.au/news', 'clcq\\.org\\.au/news/.+');
    const resolved = await resolveSlugTitles(items, async () => 'Community Legal Centres Queensland');
    expect(resolved.map((i) => i.title)).toEqual([
      'Wunya 2026',
      'Advocating for autonomy and independence',
    ]);
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

  /*
   * The case that caught an over-loose earlier draft: the slug is built from
   * these exact words, so any case-insensitive comparison calls it damaged.
   * "Budget" is capitalised, which a slug title never is.
   */
  it('leaves a real headline alone when its slug was built from the same words', () => {
    expect(
      isSlugDerived(
        'https://justiceconnect.org.au/news/federal-budget-misses-opportunity-to-unlock-billions-for-charities-under-pressure',
        'Federal Budget misses opportunity to unlock billions for charities under pressure',
      ),
    ).toBe(false);
  });

  it('leaves a headline alone when punctuation the slug cannot hold survives', () => {
    expect(
      isSlugDerived(
        'https://justiceconnect.org.au/news/raising-giving-fund-distributions-wont-fix-a-broken-dgr-system',
        'Raising giving fund distributions won’t fix a broken DGR system',
      ),
    ).toBe(false);
  });

  it('leaves a case-preserving URL alone, since nothing was flattened', () => {
    expect(
      isSlugDerived(
        'https://legalaid.qld.gov.au/news/Brisbane-Ekka-Show-Day-closures-and-service-changes',
        'Brisbane Ekka Show Day closures and service changes',
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

describe('fetchPageTitle', () => {
  const HTML = (body: string) => new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reach for the scraper when a plain GET answers', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input));
      return HTML('<title>New resources for corporate lawyers</title>');
    });
    const url = 'https://example.org/news/new-resources-corporate-lawyers';
    expect(await fetchPageTitle(url, { firecrawl: true })).toBe(
      'New resources for corporate lawyers',
    );
    expect(calls).toEqual([url]);
  });

  it('falls back to the scraper when the front door turns us away', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const target = String(input);
      calls.push(target);
      if (target.includes('/v1/scrape')) {
        return new Response(
          JSON.stringify({ data: { rawHtml: `<h1>${HEADLINE_CASED}</h1>` } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return HTML('<title>Just a moment...</title>');
    });
    expect(await fetchPageTitle(URL_, { firecrawl: true })).toBe(HEADLINE_CASED);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('/v1/scrape');
  });

  it('leaves the scraper alone unless asked', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input));
      return HTML('<title>Just a moment...</title>');
    });
    expect(await fetchPageTitle(URL_)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('still holds the slug to its word when the scraper answers', async () => {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      if (String(input).includes('/v1/scrape')) {
        return new Response(
          JSON.stringify({ data: { rawHtml: '<h1>Maddocks</h1>' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return HTML('<title>Just a moment...</title>');
    });
    expect(await fetchPageTitle(URL_, { firecrawl: true })).toBeNull();
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
