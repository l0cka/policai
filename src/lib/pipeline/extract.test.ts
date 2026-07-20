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
