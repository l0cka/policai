/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  extractCandidatesFromHtml,
  extractCandidatesFromRss,
  extractDocumentCandidate,
  extractFromHtml,
  extractFromRss,
  extractPublishedDate,
  extractPublishedDateEvidence,
  parseSourceDate,
} from './extract';

const INDEX_HTML = `
<html><body>
  <nav><a href="/privacy-policy">Privacy policy</a><a href="/contact">Contact us</a></nav>
  <main>
    <ul class="news">
      <li>
        <a href="/news/new-ai-assurance-framework">Government releases new AI assurance framework</a>
        <time datetime="2026-06-15">15 June 2026</time>
      </li>
      <li>
        <a href="https://www.example.gov.au/news/quantum-grants">Quantum computing grants announced</a>
      </li>
      <li>
        <a href="/news/ai-safety-standard-update">Update to the AI safety standard</a>
      </li>
      <li>
        <a href="/news/new-ai-assurance-framework">Government releases new AI assurance framework</a>
      </li>
    </ul>
  </main>
</body></html>
`;

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example media releases</title>
  <item>
    <title>New guidance on artificial intelligence and privacy</title>
    <link>https://www.example.gov.au/media/ai-privacy-guidance</link>
    <pubDate>Wed, 08 Jul 2026 03:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Quarterly financial results</title>
    <link>https://www.example.gov.au/media/quarterly-results</link>
    <pubDate>Tue, 07 Jul 2026 03:00:00 GMT</pubDate>
  </item>
</channel></rss>
`;

describe('extractCandidatesFromHtml', () => {
  it('reports all viable links separately from AI-policy candidates', () => {
    const result = extractFromHtml(
      `<main>
        <article><h2><a href="/news/ai-policy">New AI governance policy</a></h2></article>
        <article><h2><a href="/news/budget">Department budget update</a></h2></article>
      </main>`,
      'https://example.gov.au/news',
    );

    expect(result.itemCount).toBe(2);
    expect(result.candidates).toHaveLength(1);
  });

  it('does not count ordinary navigation on a soft-error page as index coverage', () => {
    const result = extractFromHtml(
      `<html><body>
        <nav><ul><li><a href="/about">About the department</a></li></ul></nav>
        <main><h1>Page not found</h1><a href="/">Return to homepage</a></main>
        <footer><a href="/privacy">Privacy policy</a></footer>
      </body></html>`,
      'https://example.gov.au/missing',
    );

    expect(result.itemCount).toBe(0);
    expect(result.candidates).toEqual([]);
  });

  it('does not count a heading-based help link on a soft-error page as coverage', () => {
    const result = extractFromHtml(
      `<main>
        <h1>Page not found</h1>
        <h2><a href="/help">Help and support</a></h2>
      </main>`,
      'https://example.gov.au/missing',
    );

    expect(result.itemCount).toBe(0);
    expect(result.candidates).toEqual([]);
  });

  it('does not count a generic main-content list as publication coverage', () => {
    const result = extractFromHtml(
      '<main><ul><li><a href="/account">Manage your account</a></li></ul></main>',
      'https://example.gov.au/news',
    );

    expect(result.itemCount).toBe(0);
    expect(result.candidates).toEqual([]);
  });

  it('does not count off-allow-list links as official source coverage', () => {
    const result = extractFromHtml(
      '<main><article><h2><a href="https://example.com/news">External publication update</a></h2></article></main>',
      'https://example.gov.au/news',
    );

    expect(result.itemCount).toBe(0);
  });

  it('extracts entries from Drupal views tables', () => {
    const result = extractFromHtml(
      `<main><table class="cols-3 table">
        <thead><tr>
          <th class="views-field views-field-created"><a href="?sort=asc">Date Sort ascending</a></th>
          <th class="views-field views-field-title">Title</th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="views-field views-field-created"><time datetime="2026-07-17">17 July 2026</time></td>
            <td class="views-field views-field-title"><a href="/news/ai-data-centre-standards">Draft grid standards for AI data centres</a></td>
          </tr>
          <tr>
            <td class="views-field views-field-created"><time datetime="2026-07-10">10 July 2026</time></td>
            <td class="views-field views-field-title"><a href="/news/gas-rules">New Version 92 of the National Gas Rules</a></td>
          </tr>
        </tbody>
      </table></main>`,
      'https://example.gov.au/news-centre/media-releases',
    );

    expect(result.itemCount).toBe(2);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      url: 'https://example.gov.au/news/ai-data-centre-standards',
      dateHint: '2026-07-17',
    });
  });

  it('extracts Victorian legislation whats-new table rows with their effective dates', () => {
    const row = (href: string, title: string, date: string) =>
      `<tbody class="rpl-data-table__row rpl-data-table__row--odd"><tr>
        <td data-label="Title"><div class="rpl-data-table__mobile-label">Title</div>
          <a href="${href}" class="rpl-text-link tide-search-listing__table-titles"><span>${title}</span></a></td>
        <td data-label="Type"><span class="tide-search-listing__table-type">SR as made</span></td>
        <td data-label="Effective date"><span class="tide-search-listing__table-latest--date">${date}</span></td>
      </tr></tbody>`;
    const result = extractFromHtml(
      `<main><table><thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">Effective date</th></tr></thead>
        ${row('/as-made/statutory-rules/artificial-intelligence-transparency-regulations-2026', 'Artificial Intelligence Transparency Regulations 2026', '16/09/2026')}
        ${row('/in-force/acts/building-act-1993', 'Building Act 1993', '15/09/2026')}
      </table></main>`,
      'https://www.legislation.vic.gov.au/whats-new',
    );

    expect(result.itemCount).toBe(2);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        title: 'Artificial Intelligence Transparency Regulations 2026',
        url: 'https://www.legislation.vic.gov.au/as-made/statutory-rules/artificial-intelligence-transparency-regulations-2026',
        dateHint: '2026-09-16',
      }),
    ]);
  });

  it('extracts Federal Register ngx-datatable result rows', () => {
    const result = extractFromHtml(
      `<main>
        <datatable-body-row role="row" class="datatable-body-row">
          <div class="title-name">
            <a href="/F2026L00999/asmade">Artificial Intelligence (Government Assurance) Rules 2026</a>
          </div>
        </datatable-body-row>
        <datatable-body-row role="row" class="datatable-body-row">
          <div class="title-name">
            <a href="/F2026N00516/asmade">Approval to hold a stake in a financial sector company</a>
          </div>
        </datatable-body-row>
      </main>`,
      'https://www.legislation.gov.au/search/registrationdate(today-7,today)',
    );

    expect(result.itemCount).toBe(2);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        title: 'Artificial Intelligence (Government Assurance) Rules 2026',
        url: 'https://www.legislation.gov.au/F2026L00999/asmade',
      }),
    ]);
  });

  it('extracts dated OVIC resource cards', () => {
    const result = extractFromHtml(
      `<main>
        <p class="bu-updates__item">
          <a href="/privacy/resources-for-organisations/use-of-enterprise-generative-ai-tools-in-the-victorian-public-sector/">Use of enterprise Generative AI tools in the Victorian public sector</a>
          has been published Updated 26/06/2026
        </p>
        <div class="bu-link">
          <p class="bu-link__title"><a href="/privacy/resources-for-organisations/access-policies/">Access policies</a></p>
        </div>
      </main>`,
      'https://ovic.vic.gov.au/privacy/resources-for-organisations/',
    );

    expect(result.itemCount).toBe(2);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        dateHint: '2026-06-26',
        dateHintPrecision: 'day',
        url: 'https://ovic.vic.gov.au/privacy/resources-for-organisations/use-of-enterprise-generative-ai-tools-in-the-victorian-public-sector',
      }),
    ]);
  });

  it('keeps semantic entry links inside article headers', () => {
    const result = extractFromHtml(
      `<main>
        <article>
          <header>
            <h2><a href="/news/ai-policy">New AI governance policy</a></h2>
            <time datetime="2026-07">July 2026</time>
          </header>
        </article>
      </main>`,
      'https://example.gov.au/news',
    );

    expect(result.itemCount).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      url: 'https://example.gov.au/news/ai-policy',
      dateHint: '2026-07-01',
      dateHintPrecision: 'month',
    });
  });

  it('extracts AI-relevant links with absolute URLs and drops generic pages', () => {
    const candidates = extractCandidatesFromHtml(
      INDEX_HTML,
      'https://www.example.gov.au/news',
    );

    const urls = candidates.map((c) => c.url);
    expect(urls).toContain(
      'https://www.example.gov.au/news/new-ai-assurance-framework',
    );
    expect(urls).toContain(
      'https://www.example.gov.au/news/ai-safety-standard-update',
    );
    expect(urls).not.toContain('https://www.example.gov.au/privacy-policy');
    expect(urls).not.toContain('https://www.example.gov.au/contact');
    // Not AI-relevant
    expect(urls).not.toContain('https://www.example.gov.au/news/quantum-grants');
  });

  it('captures governed data-centre infrastructure without requiring AI in the title', () => {
    const result = extractFromHtml(
      `<main><ul class="news-list">
        <li><a href="/news/draft-grid-rule-data-centres">Draft grid standards for data centre connections</a></li>
        <li><a href="/news/new-data-centre-opens">New data centre opens in regional Australia</a></li>
      </ul></main>`,
      'https://example.gov.au/news',
    );

    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://example.gov.au/news/draft-grid-rule-data-centres',
    ]);
  });

  it('dedupes repeated links', () => {
    const candidates = extractCandidatesFromHtml(
      INDEX_HTML,
      'https://www.example.gov.au/news',
    );
    const framework = candidates.filter((c) =>
      c.url.endsWith('/new-ai-assurance-framework'),
    );
    expect(framework).toHaveLength(1);
  });

  it('dedupes tracking, fragment, and trailing-slash URL variants', () => {
    const result = extractFromHtml(
      `<main>
        <article><h2><a href="/news/ai-policy/">New AI governance policy released</a></h2></article>
        <article><h2><a href="/news/ai-policy?utm_source=email#details">New AI governance policy released</a></h2></article>
      </main>`,
      'https://example.gov.au/news',
    );

    expect(result.itemCount).toBe(1);
    expect(result.candidates[0]?.url).toBe(
      'https://example.gov.au/news/ai-policy',
    );
  });

  it('caps the number of candidates', () => {
    const links = Array.from(
      { length: 40 },
      (_, i) =>
        `<li><a href="/news/ai-policy-update-${i}">AI policy framework update ${i}</a></li>`,
    ).join('\n');
    const candidates = extractCandidatesFromHtml(
      `<html><body><main><ul class="news-list">${links}</ul></main></body></html>`,
      'https://www.example.gov.au/',
      { maxCandidates: 10 },
    );
    expect(candidates).toHaveLength(10);
  });
});

describe('extractCandidatesFromRss', () => {
  it('marks a valid but empty feed so coverage is not treated as failure', () => {
    const result = extractFromRss(
      `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <title>House Inquiries</title>
        <description>New inquiries</description>
      </channel></rss>`,
      'https://www.aph.gov.au/house/rss/house_inquiries',
    );

    expect(result.itemCount).toBe(0);
    expect(result.feedValid).toBe(true);
  });

  it('does not mark ordinary HTML as a valid feed', () => {
    const result = extractFromRss(
      '<html><body>Checking your browser before accessing</body></html>',
      'https://www.example.gov.au/rss',
    );

    expect(result.itemCount).toBe(0);
    expect(result.feedValid).toBe(false);
  });

  it('reports feed item coverage even when no item is AI-policy relevant', () => {
    const result = extractFromRss(
      `<rss><channel>
        <item><title>Annual report released</title><link>https://example.gov.au/report</link></item>
      </channel></rss>`,
      'https://example.gov.au/feed',
    );

    expect(result.itemCount).toBe(1);
    expect(result.candidates).toEqual([]);
  });

  it('extracts AI-relevant feed items with published dates', () => {
    const candidates = extractCandidatesFromRss(
      RSS_XML,
      'https://www.example.gov.au/rss',
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: 'https://www.example.gov.au/media/ai-privacy-guidance',
      title: 'New guidance on artificial intelligence and privacy',
    });
    expect(candidates[0].dateHint).toBe('2026-07-08');
    expect(candidates[0].dateHintPrecision).toBe('day');
  });
});

describe('parseSourceDate', () => {
  it('preserves partial source dates without inventing day precision', () => {
    expect(parseSourceDate('2026-07')).toEqual({
      date: '2026-07-01',
      precision: 'month',
    });
    expect(parseSourceDate('2026')).toEqual({
      date: '2026-01-01',
      precision: 'year',
    });
    expect(parseSourceDate('July 2026')).toEqual({
      date: '2026-07-01',
      precision: 'month',
    });
  });

  it('preserves the source calendar date instead of rolling it through UTC', () => {
    expect(parseSourceDate('2026-07-01T00:30:00+10:00')).toEqual({
      date: '2026-07-01',
      precision: 'day',
    });
  });
});

describe('extractPublishedDate', () => {
  it('reads article publication metadata', () => {
    expect(
      extractPublishedDate(
        '<html><head><meta property="article:published_time" content="2026-05-02T10:00:00+10:00"></head><body></body></html>',
      ),
    ).toBe('2026-05-02');
    expect(
      extractPublishedDateEvidence(
        '<html><head><meta name="dcterms.issued" content="2026-05"></head></html>',
      ),
    ).toEqual({ date: '2026-05-01', precision: 'month' });
    expect(
      extractPublishedDateEvidence(
        '<html><head><meta itemprop="datePublished" content="2026-06-04"></head></html>',
      ),
    ).toEqual({ date: '2026-06-04', precision: 'day' });
  });

  it('uses publication-labelled time elements and rejects ambiguous dates', () => {
    expect(
      extractPublishedDate(
        '<html><body><p>Published: <time datetime="2026-04-16">16 April 2026</time></p></body></html>',
      ),
    ).toBe('2026-04-16');
    expect(
      extractPublishedDate(
        '<html><body><time datetime="2026-04-15">Consultation closes</time><p>Published: <time datetime="2026-04-16">16 April 2026</time></p></body></html>',
      ),
    ).toBe('2026-04-16');
    expect(
      extractPublishedDate(
        '<html><body><time datetime="2026-04-16">16 April 2026</time></body></html>',
      ),
    ).toBeNull();
    expect(
      extractPublishedDate(
        '<html><body><p>Last updated: <time datetime="2026-04-16">16 April 2026</time></p></body></html>',
      ),
    ).toBeNull();
    expect(extractPublishedDate('<html><body>No dates here</body></html>')).toBe(
      null,
    );
  });

  it('prefers an explicit visible publication label over generic CMS date metadata', () => {
    expect(
      extractPublishedDateEvidence(`
        <html>
          <head><meta name="dcterms.date" content="2026-07-13"></head>
          <body><main><h1>AI partnership</h1><p>Date published: 10 July 2026</p></main></body>
        </html>
      `),
    ).toEqual({ date: '2026-07-10', precision: 'day' });
    expect(
      extractPublishedDate(
        '<html><body><main><p>Published Monday 24 February 2025</p></main></body></html>',
      ),
    ).toBe('2025-02-24');
  });
});

describe('extractDocumentCandidate', () => {
  it('uses the document title, content, and source date without extracting links', () => {
    const candidate = extractDocumentCandidate(
      `<html>
        <head>
          <meta property="og:title" content="Artificial intelligence governance policy">
          <meta property="article:published_time" content="2026-07-01">
        </head>
        <body>
          <main><h1>Ignored duplicate heading</h1><p>Policy requirements for agencies.</p></main>
          <a href="/related-ai-framework">Related framework</a>
        </body>
      </html>`,
      'https://example.gov.au/ai-policy',
      'Fallback title',
    );

    expect(candidate).toMatchObject({
      url: 'https://example.gov.au/ai-policy',
      title: 'Artificial intelligence governance policy',
      dateHint: '2026-07-01',
      dateHintPrecision: 'day',
    });
    expect(candidate.text).toContain('Policy requirements for agencies');
    expect(candidate.text).not.toContain('Related framework');
  });
});

describe('extractFromRss with a title pattern', () => {
  const HANSARD_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>BILLS : Copyright Amendment Bill 2026 : Second Reading</title>
    <link>https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22chamber%2Fhansards%2F1%2F0001%22</link></item>
  <item><title>Federation Chamber : BILLS : Universities Accord Bill 2026 : Second Reading</title>
    <link>https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22chamber%2Fhansardr%2F2%2F0002%22</link></item>
  <item><title>STATEMENTS BY MEMBERS : Artificial Intelligence</title>
    <link>https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22chamber%2Fhansardr%2F3%2F0003%22</link></item>
  <item><title>PETITIONS : Road safety</title>
    <link>https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22chamber%2Fhansardr%2F4%2F0004%22</link></item>
</channel></rss>`;

  it('keeps items matching the pattern even when their titles carry no AI signal', () => {
    const result = extractFromRss(HANSARD_XML, 'https://parlinfo.aph.gov.au/feed', {
      titlePattern: /^(?:Federation Chamber : )?BILLS : /,
    });
    expect(result.itemCount).toBe(4);
    expect(result.candidates.map((c) => c.title)).toEqual([
      'BILLS : Copyright Amendment Bill 2026 : Second Reading',
      'Federation Chamber : BILLS : Universities Accord Bill 2026 : Second Reading',
    ]);
  });

  it('applies the title-only AI filter when no pattern is given', () => {
    const result = extractFromRss(HANSARD_XML, 'https://parlinfo.aph.gov.au/feed');
    expect(result.candidates.map((c) => c.title)).toEqual([
      'STATEMENTS BY MEMBERS : Artificial Intelligence',
    ]);
  });
});
