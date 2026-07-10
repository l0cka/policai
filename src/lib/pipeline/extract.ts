import * as cheerio from 'cheerio';
import {
  cleanScrapedLinkTitle,
  isRelevantScrapedCandidate,
} from '@/lib/scraper-filter';

/** A dated link discovered on a watch source. */
export interface Candidate {
  url: string;
  title: string;
  text: string;
  dateHint?: string;
}

const DEFAULT_MAX_CANDIDATES = 25;

function toIsoDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function dedupeByUrl(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

/**
 * Extract AI-policy-relevant link candidates from an announcement index page.
 */
export function extractCandidatesFromHtml(
  html: string,
  baseUrl: string,
  options: { maxCandidates?: number } = {},
): Candidate[] {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const $ = cheerio.load(html);
  const candidates: Candidate[] = [];

  $('a[href]').each((_, element) => {
    const link = $(element);
    const href = link.attr('href');
    if (!href) return;

    const url = toAbsoluteUrl(href, baseUrl);
    if (!url || url === baseUrl) return;

    const title = cleanScrapedLinkTitle(link.text());
    if (!title || title.length < 8) return;

    // Nearby date, if the markup provides one
    const container = link.closest('li, article, div');
    const dateHint =
      toIsoDate(container.find('time[datetime]').first().attr('datetime')) ??
      undefined;

    candidates.push({
      url,
      title,
      text: container.text().replace(/\s+/g, ' ').trim().slice(0, 300),
      dateHint,
    });
  });

  return dedupeByUrl(candidates.filter(isRelevantScrapedCandidate)).slice(
    0,
    maxCandidates,
  );
}

/**
 * Extract AI-policy-relevant items from an RSS/Atom feed.
 */
export function extractCandidatesFromRss(
  xml: string,
  baseUrl: string,
  options: { maxCandidates?: number } = {},
): Candidate[] {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const $ = cheerio.load(xml, { xmlMode: true });
  const candidates: Candidate[] = [];

  // RSS 2.0 <item> and Atom <entry>
  $('item, entry').each((_, element) => {
    const item = $(element);
    const title = item.find('title').first().text().trim();
    const href =
      item.find('link').first().attr('href') ||
      item.find('link').first().text().trim();
    if (!title || !href) return;

    const url = toAbsoluteUrl(href, baseUrl);
    if (!url) return;

    const dateHint =
      toIsoDate(item.find('pubDate').first().text()) ??
      toIsoDate(item.find('published').first().text()) ??
      toIsoDate(item.find('updated').first().text()) ??
      undefined;

    const description = item
      .find('description, summary')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    candidates.push({ url, title, text: description, dateHint });
  });

  return dedupeByUrl(candidates.filter(isRelevantScrapedCandidate)).slice(
    0,
    maxCandidates,
  );
}

/**
 * Extract the publication date from an article/announcement page, if present.
 */
export function extractPublishedDate(html: string): string | null {
  const $ = cheerio.load(html);

  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="dcterms.issued"]',
    'meta[name="dcterms.date"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
  ];
  for (const selector of metaSelectors) {
    const value = toIsoDate($(selector).attr('content'));
    if (value) return value;
  }

  return toIsoDate($('time[datetime]').first().attr('datetime'));
}
