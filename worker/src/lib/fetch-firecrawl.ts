export type RawItem = {
  url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
};

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function isSameOrSubdomain(candidateHost: string, baseHost: string): boolean {
  return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`);
}

export function extractListingLinks(markdown: string, baseUrl: string, itemLinkPattern: string): RawItem[] {
  const pattern = new RegExp(itemLinkPattern);
  const baseHost = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  const items: RawItem[] = [];
  for (const m of markdown.matchAll(LINK_RE)) {
    const title = m[1].trim();
    let resolved: URL;
    try {
      resolved = new URL(m[2], baseUrl);
    } catch {
      continue;
    }
    const url = resolved.toString();
    if (!isSameOrSubdomain(resolved.hostname, baseHost)) continue;
    if (!pattern.test(url) || seen.has(url) || title.length < 8) continue;
    seen.add(url);
    items.push({ url, title, published_at: null, excerpt: null });
  }
  return items;
}

export async function fetchFirecrawl(url: string, itemLinkPattern: string): Promise<RawItem[]> {
  const base = process.env.FIRECRAWL_URL ?? 'http://127.0.0.1:3002';
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
