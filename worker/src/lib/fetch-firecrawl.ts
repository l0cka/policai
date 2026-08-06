export type RawItem = {
  url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
};

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;

// Link text that marks site chrome, not content: skip links, teaser buttons,
// section indexes. Matched against the whole normalized title.
const NAV_NOISE_RE =
  /^(skip to\b|see all\b|view all\b|read more\b|learn more\b|find out more\b|make a submission\b|subscribe\b|join our\b|back to\b|sign up\b|contact us\b)/i;

// Static assets that sometimes appear as link targets on listing pages.
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|css|js|xml)$/i;

function isSameOrSubdomain(candidateHost: string, baseHost: string): boolean {
  return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`);
}

// Some listings render items as image-only anchors, leaving the markdown link
// text empty ([](…/media/news/some-slug)). The slug is the only title we have;
// the enrichment pass writes the real briefing text later.
function titleFromSlug(u: URL): string {
  const segment = u.pathname.split('/').filter(Boolean).pop() ?? '';
  const words = decodeURIComponent(segment).replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

export function extractListingLinks(markdown: string, baseUrl: string, itemLinkPattern: string): RawItem[] {
  const pattern = new RegExp(itemLinkPattern);
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const items: RawItem[] = [];
  // Card-style listings nest an image inside the anchor —
  // [![alt](img.jpg)\ Title](url) — which defeats a flat link regex.
  // Remove image syntax first so the anchor reads [Title](url).
  const flattened = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  for (const m of flattened.matchAll(LINK_RE)) {
    let resolved: URL;
    try {
      resolved = new URL(m[2], baseUrl);
    } catch {
      continue;
    }
    resolved.hash = '';
    const url = resolved.toString();
    if (!isSameOrSubdomain(resolved.hostname, base.hostname)) continue;
    // A fragment link to the listing page itself is navigation, never an item.
    if (resolved.pathname === base.pathname && resolved.search === base.search) continue;
    if (ASSET_RE.test(resolved.pathname)) continue;
    const linkText = m[1].replace(/^[\s\\#>*]+/, '').replace(/\s+/g, ' ').trim();
    if (NAV_NOISE_RE.test(linkText)) continue;
    const title = linkText || titleFromSlug(resolved);
    if (!pattern.test(url) || seen.has(url) || title.length < 8) continue;
    seen.add(url);
    items.push({ url, title, published_at: null, excerpt: null });
  }
  return items;
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
  return extractListingLinks(markdown, url, itemLinkPattern);
}
