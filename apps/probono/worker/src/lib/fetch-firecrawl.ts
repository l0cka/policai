import { fetchPageTitle, mapWithConcurrency } from './page-title.js';

export type RawItem = {
  url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
  /*
   * Set when the listing gave us no usable link text and the title had to be
   * derived from the URL slug. Such a title has lost its capitalisation and,
   * on most CMSs, its stopwords; `resolveSlugTitles` trades it for the real
   * headline off the item's own page. Absent on RSS items, which carry a
   * publisher-written title already.
   */
  title_from_slug?: boolean;
};

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;

// Link text that marks site chrome, not content: skip links, section
// indexes, calls to action. These links never point at an item — skip them.
const NAV_NOISE_RE =
  /^(skip to\b|see all\b|view all\b|make a submission\b|subscribe\b|join our\b|back to\b|sign up\b|contact us\b)/i;

// Teaser-button text ("READ MORE") — the link DOES point at an item, the
// text just isn't a title. Fall through to a slug-derived title instead.
const TEASER_RE = /^(read more\b|learn more\b|find out more\b|more info\b|continue reading\b)/i;

// Static assets that sometimes appear as link targets on listing pages.
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|css|js|xml)$/i;

function isSameOrSubdomain(candidateHost: string, baseHost: string): boolean {
  return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`);
}

/*
 * Acronyms a slug flattens to lowercase. Sentence-casing alone turns
 * `un-arbitrary-detention` into "Un arbitrary detention", which reads as a
 * typo now that the title is the headline on the deadlines page.
 *
 * Deliberately excludes anything that is also an ordinary word — ACT, aid, sa
 * as a Spanish article and so on — because restoring those would corrupt more
 * titles than it repairs.
 */
const SLUG_ACRONYMS = new Set([
  'un', 'unhcr', 'nsw', 'qld', 'wa', 'nt', 'tas', 'vic', 'sa',
  'ndis', 'naidoc', 'alrc', 'vlrc', 'atsils', 'naaja', 'fvpls',
  'clc', 'clcs', 'eoi', 'rap', 'icl', 'dfv', 'fdv', 'agd', 'ai', 'nda',
]);

// Some listings render items as image-only anchors, leaving the markdown link
// text empty ([](…/media/news/some-slug)). The slug is the only title we have;
// the enrichment pass writes the real briefing text later.
export function titleFromSlug(u: URL, acronyms: ReadonlySet<string> = SLUG_ACRONYMS): string {
  const segment = u.pathname.split('/').filter(Boolean).pop() ?? '';
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding in a scraped link (page content is
    // attacker-influenced); the raw segment still makes a usable title.
  }
  const words = decoded.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!words) return '';

  const cased = words
    .split(' ')
    .map((word) => (acronyms.has(word.toLowerCase()) ? word.toUpperCase() : word))
    .join(' ');

  // Sentence case, unless the first word was restored as an acronym.
  return acronyms.has(cased.split(' ')[0].toLowerCase())
    ? cased
    : cased[0].toUpperCase() + cased.slice(1);
}

/*
 * Every shape this derivation has produced, for recognising its own past
 * output. Titles stored before the acronym restore landed read "Un arbitrary
 * detention" where today's derivation gives "UN arbitrary detention"; both are
 * this function's work and both should be repaired.
 */
export function slugTitleVariants(u: URL): string[] {
  const variants = [titleFromSlug(u), titleFromSlug(u, new Set<string>())];
  return [...new Set(variants)].filter(Boolean);
}

export function extractListingLinks(markdown: string, baseUrl: string, itemLinkPattern: string): RawItem[] {
  let pattern: RegExp;
  try {
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    pattern = new RegExp(itemLinkPattern);
  } catch {
    return [];
  }
  const base = URL.parse(baseUrl);
  if (!base) return [];
  const seen = new Set<string>();
  const items: RawItem[] = [];
  // Card-style listings nest an image inside the anchor —
  // [![alt](img.jpg)\ Title](url) — which defeats a flat link regex.
  // Remove image syntax first so the anchor reads [Title](url).
  const flattened = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  for (const m of flattened.matchAll(LINK_RE)) {
    const resolved = URL.parse(m[2], baseUrl);
    if (!resolved) continue;
    resolved.hash = '';
    const url = resolved.toString();
    if (!isSameOrSubdomain(resolved.hostname, base.hostname)) continue;
    // A fragment link to the listing page itself is navigation, never an item.
    if (resolved.pathname === base.pathname && resolved.search === base.search) continue;
    if (ASSET_RE.test(resolved.pathname)) continue;
    const linkText = m[1].replace(/^[\s\\#>*]+/, '').replace(/[\s\\|–—-]+$/, '').replace(/\s+/g, ' ').trim();
    if (NAV_NOISE_RE.test(linkText)) continue;
    const fromSlug = !linkText || TEASER_RE.test(linkText);
    const title = fromSlug ? titleFromSlug(resolved) : linkText;
    if (!pattern.test(url) || seen.has(url) || title.length < 8) continue;
    seen.add(url);
    items.push({ url, title, published_at: null, excerpt: null, title_from_slug: fromSlug });
  }
  return items;
}

/**
 * Replace slug-derived titles with the headline from each item's own page.
 * A page that will not answer keeps its slug title — a lossy title beats none.
 */
export async function resolveSlugTitles(
  items: RawItem[],
  lookup: (url: string) => Promise<string | null> = (url) =>
    fetchPageTitle(url, { firecrawl: true }),
): Promise<RawItem[]> {
  const pending = items.filter((i) => i.title_from_slug);
  if (pending.length === 0) return items;
  // Two at a time, not four: a listing whose links are all image anchors would
  // otherwise arrive at one site as a burst of rendered scrapes.
  const titles = await mapWithConcurrency(pending, 2, (item) => lookup(item.url));
  const repeated = countRepeats(titles);
  pending.forEach((item, index) => {
    const real = titles[index];
    if (real && !repeated.has(real)) item.title = real;
  });
  return items;
}

/**
 * Titles proposed for more than one item. A headline belongs to its article;
 * a string that arrives for two of them is the site's own name or a listing
 * page's, and taking it would file both articles under the same title.
 */
export function countRepeats(titles: (string | null)[]): Set<string> {
  const seen = new Map<string, number>();
  for (const t of titles) {
    if (t) seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const [title, count] of seen) if (count > 1) repeated.add(title);
  return repeated;
}

export async function fetchFirecrawl(url: string, itemLinkPattern: string): Promise<RawItem[]> {
  const base = process.env.FIRECRAWL_URL ?? 'http://127.0.0.1:3003';
  const res = await fetch(`${base}/v1/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer self-hosted' },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`firecrawl ${res.status} for ${url}`);
  const body = (await res.json()) as { data?: { markdown?: string } };
  const markdown = body.data?.markdown;
  if (!markdown) throw new Error(`firecrawl returned no markdown for ${url}`);
  return resolveSlugTitles(extractListingLinks(markdown, url, itemLinkPattern));
}
