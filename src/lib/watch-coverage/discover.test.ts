import { describe, expect, it } from 'vitest';
import { createHostGate } from '@/lib/pipeline/host-gate';
import { admitThroughGate } from '@/lib/pipeline/fetch';
import type { Host } from '@/lib/pipeline/host';
import type { Body, BodyId } from './bodies';
import { discoverForBody, feedLinks, feedTitles, sitemapSections } from './discover';

const BODY: Body = {
  id: 'example' as BodyId,
  name: 'Example Department',
  jurisdiction: 'federal',
  tier: 'A',
  hosts: ['www.example.gov.au' as Host],
  scope: { status: 'unassessed' },
};
const ORIGIN = 'https://www.example.gov.au';

const pages = (prefix: string, slugs: string[]) =>
  slugs.map((slug) => `<url><loc>${ORIGIN}${prefix}/${slug}</loc></url>`).join('');

const SITE: Record<string, string> = {
  [`${ORIGIN}/`]: `<html><head>
    <link rel="alternate" type="application/rss+xml" title="Media releases" href="/media/feed.xml">
    <link rel="stylesheet" href="/site.css">
  </head></html>`,
  [`${ORIGIN}/media/feed.xml`]: `<rss><channel><title>Media</title>
    <item><title>New AI assurance framework</title></item>
    <item><title><![CDATA[Budget &amp; estimates]]></title></item>
  </channel></rss>`,
  [`${ORIGIN}/sitemap-index.xml`]: `<sitemapindex>
    <sitemap><loc>${ORIGIN}/sitemap-1.xml</loc></sitemap>
    <sitemap><loc>${ORIGIN}/private/sitemap-2.xml</loc></sitemap>
  </sitemapindex>`,
  [`${ORIGIN}/sitemap-1.xml`]: `<urlset>${pages('/publications', [
    'artificial-intelligence-policy',
    'annual-report-2025',
    'corporate-plan',
  ])}${pages('/staff/directory', ['a', 'b', 'c'])}${pages('/news', ['ai-rules', 'budget', 'grants'])}</urlset>`,
  [`${ORIGIN}/private/sitemap-2.xml`]: `<urlset>${pages('/private/ai', ['one', 'two', 'three'])}</urlset>`,
};

const ROBOTS = `User-agent: *
Disallow: /private/
Disallow: /news
Sitemap: ${ORIGIN}/sitemap-index.xml
`;

function harness() {
  const requested: string[] = [];
  const gate = createHostGate({
    hosts: {},
    refused: new Map(),
    fetchRobots: async () => ({ status: 200, body: ROBOTS }),
    now: Date.now,
    sleep: async () => {},
  });
  const fetchText = async (url: string) => {
    await admitThroughGate(gate, url);
    requested.push(url);
    const body = SITE[url];
    if (body === undefined) throw new Error(`HTTP 404 at ${url}`);
    return body;
  };
  return { gate, fetchText, requested };
}

describe('discoverForBody', () => {
  it('proposes declared feeds and AI-leaning sitemap sections, ranked', async () => {
    const { gate, fetchText } = harness();
    const { proposals } = await discoverForBody(BODY, { gate, fetchText });
    expect(proposals.map((p) => [p.url, p.kind, p.evidence])).toEqual([
      [`${ORIGIN}/media/feed.xml`, 'rss', 'feed_link'],
      [`${ORIGIN}/publications`, 'html-index', 'robots_sitemap'],
    ]);
    expect(proposals[0].sampleTitles).toEqual(['New AI assurance framework', 'Budget & estimates']);
    expect(proposals[1].sampleTitles[0]).toBe('artificial intelligence policy');
  });

  it('honours robots.txt: no disallowed request and no disallowed proposal', async () => {
    const { gate, fetchText, requested } = harness();
    const { proposals, skipped } = await discoverForBody(BODY, { gate, fetchText });
    expect(requested.some((url) => url.includes('/private/'))).toBe(false);
    expect(proposals.some((p) => p.url.startsWith(`${ORIGIN}/news`))).toBe(false);
    expect(skipped.map((s) => s.url)).toEqual(
      expect.arrayContaining([`${ORIGIN}/private/sitemap-2.xml`, `${ORIGIN}/news`]),
    );
  });

  it('falls back to /sitemap.xml when robots.txt names no sitemap', async () => {
    const requested: string[] = [];
    const gate = createHostGate({
      hosts: {},
      refused: new Map(),
      fetchRobots: async () => ({ status: 404, body: '' }),
      now: Date.now,
      sleep: async () => {},
    });
    await discoverForBody(BODY, {
      gate,
      fetchText: async (url) => {
        await admitThroughGate(gate, url);
        requested.push(url);
        return '<html></html>';
      },
    });
    expect(requested).toEqual([`${ORIGIN}/`, `${ORIGIN}/sitemap.xml`]);
  });
});

describe('parsers', () => {
  it('reads only alternate feed links', () => {
    expect(
      feedLinks('<link href="a.xml" rel="alternate" type="application/atom+xml"><link rel="alternate" href="b.html">', `${ORIGIN}/x/`),
    ).toEqual([{ url: `${ORIGIN}/x/a.xml`, title: '' }]);
  });

  it('reads Atom entry titles', () => {
    expect(feedTitles('<feed><title>F</title><entry><title type="text">E1</title></entry></feed>')).toEqual(['E1']);
  });

  it('ignores thin sections and other origins', () => {
    expect(
      sitemapSections([`${ORIGIN}/media/a`, `${ORIGIN}/media/b`, 'https://other.gov.au/media/c'], ORIGIN, 'sitemap_xml'),
    ).toEqual([]);
  });
});
