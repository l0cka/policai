import { decodeEntities } from './page-title.js';
import { PAGE_TEXT_LIMIT } from './deadline-verify.js';

/*
 * The source page as plain text, for the deadline verifier. Firecrawl first
 * (it renders client-side pages and gets past most front doors), then a plain
 * GET with the markup stripped. Capped: the verifier needs the body copy, not
 * a site's whole footer.
 */

const UA = 'Mozilla/5.0 (compatible; ProBonoRadar/1.0; +https://a2j.policai.org) deadline-verifier';
const MAX_BYTES = 1024 * 1024;

export type PageText = { text: string; via: 'firecrawl' | 'direct' };

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/* Drop markdown link targets and images; they cost tokens and carry no dates. */
export function compactMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^()\s]|\([^)]*\))*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/*
 * A bot-wall or interstitial, not the article. Verifying against it would read
 * every date as not_found, so it counts as no page at all.
 */
const BOT_WALL_RE =
  /performing security verification|verifying you are (not a bot|human)|just a moment\.\.\.|checking your browser|enable javascript and cookies to continue|attention required! \| cloudflare|access denied/i;

export function isUsablePage(text: string | null | undefined): text is string {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 200) return false;
  return !(t.length < 3000 && BOT_WALL_RE.test(t));
}

export async function fetchViaFirecrawl(url: string, timeoutMs = 120_000): Promise<string | null> {
  const base = process.env.FIRECRAWL_URL ?? 'http://127.0.0.1:3003';
  try {
    const res = await fetch(`${base}/v1/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer self-hosted' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { markdown?: string } };
    const md = body.data?.markdown;
    const text = md ? compactMarkdown(md) : null;
    return isUsablePage(text) ? text : null;
  } catch {
    return null;
  }
}

export async function fetchDirect(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) return null;
    const buf = await res.arrayBuffer();
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BYTES));
    const text = htmlToText(html);
    return isUsablePage(text) ? text : null;
  } catch {
    return null;
  }
}

const DATE_LINE_RE = new RegExp(
  `\\b\\d{1,2}(st|nd|rd|th)?\\s+(${['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].join('|')})|\\b(close[sd]?|closing|due|deadline)\\b`,
  'i',
);

/*
 * Cap long pages without losing their dates. Consultation platforms often put
 * "Closes 25 Sep 2026" in a footer panel well past the body, so a plain head
 * slice can drop the one line the verifier needs. Keep the head, every
 * date-bearing line from the middle, then the tail.
 */
export function capPageText(text: string, limit = PAGE_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  const headLen = Math.floor(limit * 0.6);
  const tailLen = Math.floor(limit * 0.15);
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  const budget = limit - headLen - tailLen - 40;
  const middle: string[] = [];
  let used = 0;
  for (const line of text.slice(headLen, text.length - tailLen).split('\n')) {
    if (!DATE_LINE_RE.test(line)) continue;
    const l = line.trim().slice(0, 400);
    if (used + l.length + 1 > budget) break;
    middle.push(l);
    used += l.length + 1;
  }
  return `${head}\n[…]\n${middle.join('\n')}\n[…]\n${tail}`;
}

export async function fetchPageText(url: string): Promise<PageText | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const fc = await fetchViaFirecrawl(url);
  if (fc) return { text: capPageText(fc), via: 'firecrawl' };
  const direct = await fetchDirect(url);
  if (direct) return { text: capPageText(direct), via: 'direct' };
  return null;
}
