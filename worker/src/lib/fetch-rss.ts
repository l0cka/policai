import Parser from 'rss-parser';
import type { RawItem } from './fetch-firecrawl.js';

const parser = new Parser({ timeout: 30_000 });

export async function fetchRss(feedUrl: string): Promise<RawItem[]> {
  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? []).flatMap((it) => {
    if (!it.link || !it.title) return [];
    return [{
      url: it.link,
      title: it.title.trim(),
      published_at: it.isoDate ?? null,
      excerpt: (it.contentSnippet ?? '').slice(0, 700) || null,
    }];
  });
}

// Test seam: parse a local XML string instead of a URL.
export async function parseRssString(xml: string): Promise<RawItem[]> {
  const feed = await parser.parseString(xml);
  return (feed.items ?? []).flatMap((it) => {
    if (!it.link || !it.title) return [];
    return [{
      url: it.link,
      title: it.title.trim(),
      published_at: it.isoDate ?? null,
      excerpt: (it.contentSnippet ?? '').slice(0, 700) || null,
    }];
  });
}
