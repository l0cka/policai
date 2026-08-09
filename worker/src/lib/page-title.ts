/*
 * Recovering a real headline for items whose title came from a URL slug.
 *
 * `titleFromSlug` exists because some listings render items as image-only or
 * "READ MORE" anchors, leaving no link text. A slug is lossy in two directions
 * at once, and only one of them looks like a bug:
 *
 *   - case is flattened, so "Yindjibarndi Ngurra Aboriginal Corporation v
 *     State of Western Australia (No 2) [2026] FCA 585" comes back as prose;
 *   - most CMSs strip stopwords when they build the slug, so words are simply
 *     gone — "in the courtroom, one volunteer at a time" becomes "courtroom
 *     one volunteer time".
 *
 * No transformation of the slug can put those words back. The only copy of the
 * real title is on the item's own page, so that is where we go and get it.
 *
 * This is a plain HTTP GET, not a Firecrawl call: we want one element out of
 * the document head, not a rendered page, and it should cost nothing.
 */

const UA =
  'Mozilla/5.0 (compatible; ProBonoRadar/1.0; +https://a2j.policai.org) title-resolver';

// The head is all we need. Sites that put megabytes of inline script before
// </head> are the reason this is a cap and not a whole-body read.
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 10_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·',
  bull: '•', deg: '°', trade: '™', copy: '©', reg: '®', eacute: 'é',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      // Lone surrogates and out-of-range code points throw in fromCodePoint.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function clean(text: string): string {
  return decodeEntities(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meta(html: string, property: string): string | null {
  // Attribute order varies, so match the tag first and read its content after.
  const tags = html.matchAll(/<meta\b[^>]*>/gi);
  for (const [tag] of tags) {
    const key = /\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (key?.toLowerCase() !== property) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = content?.[1] ?? content?.[2] ?? content?.[3];
    if (value) return clean(value);
  }
  return null;
}

/*
 * A <title> is usually "Headline | Site Name". Strip that tail, but only when
 * the evidence is strong: og:site_name matching, or the registrable domain
 * name matching. A blind "drop everything after the last pipe" rule truncates
 * titles that legitimately contain one.
 */
function stripSiteSuffix(title: string, siteName: string | null, host: string): string {
  const domainWord = host.replace(/^www\./, '').split('.')[0].toLowerCase();
  const candidates = [siteName?.toLowerCase(), domainWord].filter(Boolean) as string[];

  const parts = title.split(/\s+[|·•‑–—-]\s+/);
  if (parts.length < 2) return title;

  const tail = parts[parts.length - 1];
  const flat = tail.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matches = candidates.some((c) => {
    const cf = c.replace(/[^a-z0-9]/g, '');
    return cf.length > 2 && (flat === cf || flat.includes(cf) || cf.includes(flat));
  });

  if (!matches) return title;
  const head = parts.slice(0, -1).join(' | ').trim();
  // Never trade a real headline for nothing: a page titled only with its site
  // name has no headline to recover.
  return head.length >= 8 ? head : title;
}

/*
 * Boilerplate a CMS emits when it has nothing better. Accepting one of these
 * would replace a lossy title with a useless one.
 */
const JUNK_TITLE_RE =
  /^(home|news|untitled|article|blog|insights?|page not found|404|access denied|just a moment|attention required)\b/i;

export function extractPageTitle(html: string, pageUrl: string): string | null {
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    // A malformed URL only costs us the site-suffix check.
  }
  const siteName = meta(html, 'og:site_name');

  const og = meta(html, 'og:title') ?? meta(html, 'twitter:title');
  const h1 = clean(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '');
  const docTitle = clean(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');

  /*
   * og:title first — publishers write it for sharing, so it is the headline
   * without the site furniture. <title> outranks <h1> because an <h1> is often
   * the site's own wordmark in a header, and the suffix strip handles the
   * furniture that <title> does carry.
   */
  const ordered = [
    og,
    docTitle ? stripSiteSuffix(docTitle, siteName, host) : null,
    h1,
  ];

  for (const candidate of ordered) {
    if (!candidate) continue;
    const value = candidate.trim();
    if (value.length < 8 || value.length > 300) continue;
    if (JUNK_TITLE_RE.test(value)) continue;
    if (siteName && value.toLowerCase() === siteName.toLowerCase()) continue;
    return value;
  }
  return null;
}

/** Read at most MAX_BYTES of the response, then stop pulling. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      html += decoder.decode(value, { stream: true });
      // </head> is enough for og:title and <title>; <h1> may follow, so allow
      // a little of the body before giving up on it.
      if (size >= MAX_BYTES || /<\/head>/i.test(html)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return html;
}

export async function fetchPageTitle(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/html|application\/xhtml/i.test(type)) return null;
    return extractPageTitle(await readCapped(res), res.url || url);
  } catch {
    // Unreachable, slow, or hostile page: the slug title stands.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve `fn` over `items` with a small concurrency cap, so a listing of
 * forty slug-titled links does not arrive at one site as forty simultaneous
 * requests.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
