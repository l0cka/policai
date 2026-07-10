/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  extractCandidatesFromHtml,
  extractCandidatesFromRss,
  extractPublishedDate,
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

  it('caps the number of candidates', () => {
    const links = Array.from(
      { length: 40 },
      (_, i) =>
        `<a href="/news/ai-policy-update-${i}">AI policy framework update ${i}</a>`,
    ).join('\n');
    const candidates = extractCandidatesFromHtml(
      `<html><body>${links}</body></html>`,
      'https://www.example.gov.au/',
      { maxCandidates: 10 },
    );
    expect(candidates).toHaveLength(10);
  });
});

describe('extractCandidatesFromRss', () => {
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
  });
});

describe('extractPublishedDate', () => {
  it('reads article publication metadata', () => {
    expect(
      extractPublishedDate(
        '<html><head><meta property="article:published_time" content="2026-05-02T10:00:00+10:00"></head><body></body></html>',
      ),
    ).toBe('2026-05-02');
  });

  it('falls back to time elements and returns null when absent', () => {
    expect(
      extractPublishedDate(
        '<html><body><time datetime="2026-04-16">16 April 2026</time></body></html>',
      ),
    ).toBe('2026-04-16');
    expect(extractPublishedDate('<html><body>No dates here</body></html>')).toBe(
      null,
    );
  });
});
