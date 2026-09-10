import Parser from 'rss-parser';
import type { RawItem } from './fetch-firecrawl.js';

const parser = new Parser({ timeout: 30_000 });

type FeedEntry = { link?: string; title?: string; guid?: string; isoDate?: string; contentSnippet?: string };

// Some feeds emit broken <link> values (e.g. probonocentre.org.au's
// "http://voco-11-…" links, where the CMS drops the domain). A hostname
// without a dot is never a real public URL; fall back to the guid, which
// WordPress populates with a working ?p= permalink.
function bestUrl(it: FeedEntry): string | null {
  for (const candidate of [it.link, it.guid]) {
    if (!candidate) continue;
    try {
      const u = new URL(candidate);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function toRawItems(items: FeedEntry[] | undefined): RawItem[] {
  return (items ?? []).flatMap((it) => {
    const url = bestUrl(it);
    if (!url || !it.title) return [];
    return [{
      url,
      title: it.title.trim(),
      published_at: it.isoDate ?? null,
      excerpt: (it.contentSnippet ?? '').slice(0, 700) || null,
    }];
  });
}

export async function fetchRss(feedUrl: string): Promise<RawItem[]> {
  const feed = await parser.parseURL(feedUrl);
  return toRawItems(feed.items);
}

// Test seam: parse a local XML string instead of a URL.
export async function parseRssString(xml: string): Promise<RawItem[]> {
  const feed = await parser.parseString(xml);
  return toRawItems(feed.items);
}
