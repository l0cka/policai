import type { HostGate } from '@/lib/pipeline/host-gate';
import { robotsAllows } from '@/lib/pipeline/robots';
import type { SourceKind } from '@/lib/pipeline/sources';
import type { Body } from './bodies';

export type ProposalEvidence = 'robots_sitemap' | 'sitemap_xml' | 'feed_link';

export interface SourceProposal {
  url: string;
  kind: Extract<SourceKind, 'rss' | 'html-index'>;
  evidence: ProposalEvidence;
  score: number;
  /** Item titles for a feed; page names from the sitemap for an index. */
  sampleTitles: string[];
}

export interface Discovery {
  proposals: SourceProposal[];
  /** Requests that were refused, failed or disallowed by robots.txt. */
  skipped: Array<{ url: string; reason: string }>;
}

export interface DiscoverDeps {
  gate: HostGate;
  /** Retrieves one URL through `gate` under the declared identity. */
  fetchText: (url: string) => Promise<string>;
}

const MAX_SITEMAPS_PER_HOST = 5;
const MAX_SITEMAP_URLS = 5000;
const MIN_PAGES_PER_SECTION = 3;
const MAX_PROPOSALS = 15;
const SAMPLE_SIZE = 3;

const AI_TERMS = /\b(ai|artificial[- ]intelligence|automated[- ]decision|machine[- ]learning|algorithm)/i;
const PUBLISHING_TERMS =
  /(media|news|release|announcement|statement|speech|publication|report|consultation|submission|guidance|guideline|policy|policies|framework|strategy|notice|update)/i;

/** Higher for paths and titles that read like a publishing stream about AI. */
export function relevanceScore(text: string): number {
  return (AI_TERMS.test(text) ? 3 : 0) + (PUBLISHING_TERMS.test(text) ? 1 : 0);
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? (match[2] ?? match[3] ?? null) : null;
}

/** `<link rel="alternate">` feeds declared by a page. */
export function feedLinks(html: string, baseUrl: string): Array<{ url: string; title: string }> {
  const feeds: Array<{ url: string; title: string }> = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\balternate\b/i.test(attribute(tag, 'rel') ?? '')) continue;
    if (!/(rss|atom)\+xml/i.test(attribute(tag, 'type') ?? '')) continue;
    const href = attribute(tag, 'href');
    if (!href || !URL.canParse(href, baseUrl)) continue;
    feeds.push({ url: new URL(decodeEntities(href), baseUrl).href, title: decodeEntities(attribute(tag, 'title') ?? '') });
  }
  return feeds;
}

/** Item or entry titles from an RSS or Atom document, in order. */
export function feedTitles(xml: string): string[] {
  return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((match) =>
    decodeEntities(match[2]),
  );
}

/** `<loc>` values, and whether the document is a sitemap index. */
export function sitemapLocations(xml: string): { index: boolean; urls: string[] } {
  return {
    index: /<sitemapindex\b/i.test(xml),
    urls: [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((match) => decodeEntities(match[1])),
  };
}

function pageName(url: URL): string {
  const slug = url.pathname.split('/').filter(Boolean).pop() ?? url.hostname;
  return decodeURIComponent(slug).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

/**
 * Groups sitemap pages by their first one or two path segments and proposes
 * each well-populated section as an index, scored by its path and page names.
 */
export function sitemapSections(
  urls: readonly string[],
  origin: string,
  evidence: ProposalEvidence,
): SourceProposal[] {
  const sections = new Map<string, URL[]>();
  for (const raw of urls) {
    if (!URL.canParse(raw)) continue;
    const url = new URL(raw);
    if (url.origin !== origin) continue;
    const segments = url.pathname.split('/').filter(Boolean);
    for (let depth = 1; depth <= Math.min(2, segments.length - 1); depth++) {
      const prefix = `/${segments.slice(0, depth).join('/')}`;
      sections.set(prefix, [...(sections.get(prefix) ?? []), url]);
    }
  }
  return [...sections].flatMap(([prefix, pages]) => {
    if (pages.length < MIN_PAGES_PER_SECTION) return [];
    const names = pages.map(pageName);
    const aiPages = names.filter((name) => AI_TERMS.test(name)).length;
    const score = relevanceScore(prefix) * 2 + Math.min(aiPages, 5);
    if (score === 0) return [];
    return [
      {
        url: `${origin}${prefix}`,
        kind: 'html-index' as const,
        evidence,
        score,
        sampleTitles: [...names.filter((name) => AI_TERMS.test(name)), ...names].slice(0, SAMPLE_SIZE),
      },
    ];
  });
}

/**
 * Proposes candidate sources for a body from what its hosts publish for
 * crawlers: robots.txt `Sitemap:` lines, `/sitemap.xml` when robots.txt
 * names none, and feeds linked from the home page. Every request goes
 * through the host gate, so robots.txt, pacing and decided blocks hold.
 * Nothing is written; people admit sources through a reviewed PR.
 */
export async function discoverForBody(body: Body, deps: DiscoverDeps): Promise<Discovery> {
  const proposals: SourceProposal[] = [];
  const skipped: Discovery['skipped'] = [];
  const get = async (url: string): Promise<string | null> => {
    try {
      return await deps.fetchText(url);
    } catch (error) {
      skipped.push({ url, reason: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };

  for (const host of body.hosts) {
    const origin = `https://${host}`;
    const home = await get(`${origin}/`);
    for (const feed of home ? feedLinks(home, `${origin}/`) : []) {
      const xml = await get(feed.url);
      if (xml === null) continue;
      const titles = feedTitles(xml);
      proposals.push({
        url: feed.url,
        kind: 'rss',
        evidence: 'feed_link',
        score: 2 + relevanceScore(`${feed.url} ${feed.title}`) + Math.min(titles.filter((t) => AI_TERMS.test(t)).length, 5),
        sampleTitles: titles.slice(0, SAMPLE_SIZE),
      });
    }

    const robots = deps.gate.hosts()[host]?.robots ?? null;
    const listed = robots?.sitemaps ?? [];
    const queue = listed.length > 0 ? [...listed] : [`${origin}/sitemap.xml`];
    const evidence: ProposalEvidence = listed.length > 0 ? 'robots_sitemap' : 'sitemap_xml';
    const pages: string[] = [];
    for (let fetched = 0; queue.length > 0 && fetched < MAX_SITEMAPS_PER_HOST; fetched++) {
      const xml = await get(queue.shift()!);
      if (xml === null) continue;
      const { index, urls } = sitemapLocations(xml);
      if (index) queue.push(...urls.filter((url) => !url.endsWith('.gz')));
      else pages.push(...urls.slice(0, MAX_SITEMAP_URLS - pages.length));
    }
    for (const proposal of sitemapSections(pages, origin, evidence)) {
      if (robots && !robotsAllows(robots, new URL(proposal.url))) {
        skipped.push({ url: proposal.url, reason: 'robots.txt disallows this path' });
        continue;
      }
      proposals.push(proposal);
    }
  }

  return {
    proposals: proposals.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, MAX_PROPOSALS),
    skipped,
  };
}
