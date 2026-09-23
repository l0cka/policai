/**
 * Display-time copy of the worker's listing-title cleaner
 * (apps/probono/worker/src/lib/listing-title.ts). The worker now stores clean
 * titles; this repairs rows ingested before that fix without a database write.
 * The two packages are independent, so keep both copies in step.
 *
 * Recover a headline from card-style listing link text.
 *
 * Firecrawl renders a card anchor whose contents span several lines as one
 * link with Markdown hard breaks (a trailing backslash), for example
 * `PRF News\ \ August 27, 2026\ \ ##### PRF seeking a consultant`. Stored
 * verbatim, the category label, repeated dates and heading hashes all end up
 * in the headline. The heading line is the publisher's title, so prefer it;
 * otherwise keep the longest line that is not just a date or a teaser.
 *
 * Plain titles pass through unchanged apart from whitespace.
 */

const HARD_BREAK_RE = /\\(?:\s+|$)/;
const HEADING_RE = /^#{1,6}\s*/;
const DATE_ONLY_RE =
  /^(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2},?\s+)?\d{4}$|^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/i;
const TEASER_RE = /^(?:read more|learn more|find out more|discover more|more info|continue reading)\b/i;

export function cleanListingTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed.includes('\\') && !HEADING_RE.test(collapsed)) return collapsed;
  const parts = collapsed
    .split(HARD_BREAK_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  const heading = parts.find((part) => HEADING_RE.test(part));
  if (heading) {
    const text = heading.replace(HEADING_RE, '').trim();
    if (text) return text;
  }
  const candidates = parts
    .map((part) => part.replace(HEADING_RE, '').trim())
    .filter((part) => part && !DATE_ONLY_RE.test(part) && !TEASER_RE.test(part));
  if (candidates.length === 0) return collapsed.replace(/\\/g, '').replace(HEADING_RE, '').trim();
  return candidates.reduce((best, part) => (part.length > best.length ? part : best));
}

export function withCleanTitles<T extends { title: string }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, title: cleanListingTitle(row.title) }));
}
