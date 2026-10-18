import Parser from 'rss-parser';
import type { RawItem } from './fetch-firecrawl.js';

/**
 * The collector identity on every retrieval path (`COLLECTOR_IDENTITY_TOKEN`
 * in the root app): `Policai/1.0 (+https://policai.org)`, with no browser
 * prefix. rss-parser's own client sends `User-Agent: rss-parser` and, for a
 * status of 300 or above, rejects with `Status code N` before it reads the
 * body. That bare status is what Source health stored. This module fetches
 * the document itself and uses rss-parser only to parse XML.
 */
export const FEED_USER_AGENT = 'Policai/1.0 (+https://policai.org)';

const parser = new Parser();
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;

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

function encodingFrom(contentType: string | null): BufferEncoding {
  const match = /(?:encoding|charset)\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '');
  const raw = (match?.[1] ?? 'utf8').toLowerCase();
  if (raw === 'utf-8' || raw === 'utf8') return 'utf8';
  if (raw === 'iso-8859-1' || raw === 'latin1') return 'latin1';
  if (raw === 'ascii' || raw === 'utf16le' || raw === 'ucs2') return raw;
  return 'utf8';
}

function statusError(status: number, url: string): string {
  if (status === 403) return `Ingest host received status 403 at ${url}`;
  return `Status code ${status} at ${url}`;
}

async function consume(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined);
}

/**
 * GET a feed and return the body. Follows at most five http(s) redirects.
 * A 403 names the URL the ingest host received, so a reader can compare that
 * response with a fetch from somewhere else.
 */
export async function readFeedXml(feedUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let current = feedUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': FEED_USER_AGENT,
        accept: 'application/rss+xml',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await consume(response);
      if (!location || redirect === MAX_REDIRECTS) throw new Error(statusError(response.status, current));
      const next = new URL(location, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new Error(`Refusing redirect from ${current} to ${next.protocol}`);
      }
      current = next.href;
      continue;
    }
    if (response.status !== 200) {
      await consume(response);
      throw new Error(statusError(response.status, current));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.toString(encodingFrom(response.headers.get('content-type')));
  }
  throw new Error(`Too many redirects at ${feedUrl}`);
}

export async function fetchRss(feedUrl: string, fetchImpl: typeof fetch = fetch): Promise<RawItem[]> {
  const xml = await readFeedXml(feedUrl, fetchImpl);
  return parseRssString(xml);
}

// Test seam: parse a local XML string instead of a URL.
export async function parseRssString(xml: string): Promise<RawItem[]> {
  const feed = await parser.parseString(xml);
  return toRawItems(feed.items);
}
