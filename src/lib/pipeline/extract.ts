import * as cheerio from 'cheerio';
import { isValidCalendarDate } from '@/lib/calendar-date';
import {
  cleanScrapedLinkTitle,
  isRelevantScrapedCandidate,
} from '@/lib/scraper-filter';
import {
  canonicalizeSourceUrl,
  isAllowedSourceHost,
  sourceUrlsEqual,
} from '@/lib/source-url';
import type { DatePrecision } from '@/types';

/** A dated link discovered on a watch source. */
export interface Candidate {
  url: string;
  title: string;
  text: string;
  dateHint?: string;
  dateHintPrecision?: DatePrecision;
  /** Stable fingerprint for a changed directly monitored document. */
  changeFingerprint?: string;
}

export interface ExtractionResult {
  itemCount: number;
  candidates: Candidate[];
  /**
   * True when the payload parsed as a real RSS/Atom feed, so an empty item
   * list means "no new entries", not a soft failure.
   */
  feedValid?: boolean;
}

const DEFAULT_MAX_CANDIDATES = 25;

export interface ParsedSourceDate {
  date: string;
  precision: DatePrecision;
}

const MONTH_NUMBERS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

export function parseSourceDate(
  value: string | undefined | null,
): ParsedSourceDate | null {
  if (!value) return null;
  const normalized = value.trim();

  const isoDay = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
  if (isoDay && isValidCalendarDate(isoDay[1])) {
    return { date: isoDay[1], precision: 'day' };
  }
  const isoMonth = normalized.match(/^(\d{4})-(\d{2})$/);
  if (
    isoMonth &&
    Number(isoMonth[2]) >= 1 &&
    Number(isoMonth[2]) <= 12
  ) {
    return {
      date: `${isoMonth[1]}-${isoMonth[2]}-01`,
      precision: 'month',
    };
  }
  const isoYear = normalized.match(/^(\d{4})$/);
  if (isoYear) {
    return { date: `${isoYear[1]}-01-01`, precision: 'year' };
  }

  const dayMonthYear = normalized.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/,
  );
  if (dayMonthYear) {
    const month = MONTH_NUMBERS[dayMonthYear[2].toLowerCase()];
    if (month) {
      const date = `${dayMonthYear[3]}-${month}-${dayMonthYear[1].padStart(2, '0')}`;
      if (!isValidCalendarDate(date)) return null;
      return { date, precision: 'day' };
    }
  }

  const monthYear = normalized.match(
    /^([A-Za-z]+)\s+(\d{4})$/,
  );
  if (monthYear) {
    const month = MONTH_NUMBERS[monthYear[1].toLowerCase()];
    if (month) {
      return {
        date: `${monthYear[2]}-${month}-01`,
        precision: 'month',
      };
    }
  }

  return null;
}

function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return canonicalizeSourceUrl(url.toString());
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
  return extractFromHtml(html, baseUrl, options).candidates;
}

export function extractFromHtml(
  html: string,
  baseUrl: string,
  options: { maxCandidates?: number } = {},
): ExtractionResult {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const $ = cheerio.load(html);
  const items: Candidate[] = [];
  let scope = $('main').first();
  if (scope.length === 0) scope = $('[role="main"]').first();
  if (scope.length === 0) scope = $('body').first();
  const entryContainerSelector = [
    'article',
    '[class*="result"]',
    '[class*="listing"]',
    '[class*="news"]',
    '[class*="publication"]',
    '[class*="media"]',
    '.views-row',
    // Drupal views tables render one entry per body row; header rows carry
    // th cells only, so sort links never count as entries.
    'tr:has(td[class*="views-field"])',
  ].join(',');
  const semanticListSelector = [
    'ul[class*="result"]',
    'ol[class*="result"]',
    'ul[class*="listing"]',
    'ol[class*="listing"]',
    'ul[class*="news"]',
    'ol[class*="news"]',
    'ul[class*="publication"]',
    'ol[class*="publication"]',
    'ul[class*="media"]',
    'ol[class*="media"]',
    '[role="list"][class*="result"]',
    '[role="list"][class*="listing"]',
    '[role="list"][class*="news"]',
    '[role="list"][class*="publication"]',
    '[role="list"][class*="media"]',
  ].join(',');

  scope.find('a[href]').each((_, element) => {
    const link = $(element);
    if (link.closest('nav, footer, aside').length > 0) return;
    const enclosingHeader = link.closest('header');
    if (
      enclosingHeader.length > 0 &&
      enclosingHeader.closest(
        [
          'article',
          '[class*="result"]',
          '[class*="listing"]',
          '[class*="news"]',
          '[class*="publication"]',
          '[class*="media"]',
          '.views-row',
        ].join(','),
      ).length === 0
    ) {
      return;
    }
    const href = link.attr('href');
    if (!href) return;

    const url = toAbsoluteUrl(href, baseUrl);
    if (!url || sourceUrlsEqual(url, baseUrl)) return;
    if (!isAllowedSourceHost(url)) return;

    const title = cleanScrapedLinkTitle(link.text());
    if (!title || title.length < 8) return;

    const listItem = link.closest('li');
    const container =
      listItem.length > 0 &&
      listItem.closest(semanticListSelector).length > 0
        ? listItem
        : link.closest(entryContainerSelector);
    if (container.length === 0) return;

    // One primary link represents one publication/result entry. Related tags
    // and utility links inside the same container do not establish coverage.
    if (link.closest('h2, h3, h4').length === 0) {
      const primaryLink = container
        .find('a[href]')
        .filter((_index, candidate) =>
          $(candidate).closest('nav, footer, aside').length === 0,
        )
        .first();
      if (primaryLink.get(0) !== element) return;
    }

    // Nearby date, if the markup provides one
    const sourceDate = parseSourceDate(
      container.find('time[datetime]').first().attr('datetime'),
    );

    items.push({
      url,
      title,
      text: container.text().replace(/\s+/g, ' ').trim().slice(0, 300),
      dateHint: sourceDate?.date,
      dateHintPrecision: sourceDate?.precision,
    });
  });

  const deduped = dedupeByUrl(items);
  return {
    itemCount: deduped.length,
    candidates: deduped
      .filter(isRelevantScrapedCandidate)
      .slice(0, maxCandidates),
  };
}

/**
 * Extract AI-policy-relevant items from an RSS/Atom feed.
 */
export function extractCandidatesFromRss(
  xml: string,
  baseUrl: string,
  options: { maxCandidates?: number } = {},
): Candidate[] {
  return extractFromRss(xml, baseUrl, options).candidates;
}

export function extractFromRss(
  xml: string,
  baseUrl: string,
  options: { maxCandidates?: number } = {},
): ExtractionResult {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: Candidate[] = [];

  // RSS 2.0 <item> and Atom <entry>
  $('item, entry').each((_, element) => {
    const item = $(element);
    const title = item.find('title').first().text().trim();
    const href =
      item.find('link').first().attr('href') ||
      item.find('link').first().text().trim();
    if (!title || !href) return;

    const url = toAbsoluteUrl(href, baseUrl);
    if (!url || !isAllowedSourceHost(url)) return;

    const sourceDate =
      parseSourceDate(item.find('pubDate').first().text()) ??
      parseSourceDate(item.find('published').first().text()) ??
      parseSourceDate(item.find('updated').first().text());

    const description = item
      .find('description, summary')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    items.push({
      url,
      title,
      text: description,
      dateHint: sourceDate?.date,
      dateHintPrecision: sourceDate?.precision,
    });
  });

  const deduped = dedupeByUrl(items);
  return {
    itemCount: deduped.length,
    candidates: deduped
      .filter(isRelevantScrapedCandidate)
      .slice(0, maxCandidates),
    feedValid: $('channel, feed').length > 0,
  };
}

/**
 * Extract the publication date from an article/announcement page, if present.
 */
export function extractPublishedDate(html: string): string | null {
  return extractPublishedDateEvidence(html)?.date ?? null;
}

export function extractPublishedDateEvidence(
  html: string,
): ParsedSourceDate | null {
  const $ = cheerio.load(html);

  const visibleContainer = $('main, article, [role="main"]').first();
  const visibleText = (visibleContainer.length > 0 ? visibleContainer : $('body'))
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const visiblePublicationLabel = visibleText.match(
    /\b(?:date\s+published|published(?:\s+on)?|publication\s+date|date\s+issued|issued\s+on|release\s+date)\s*:?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*((?:\d{1,2}\s+[a-z]+\s+\d{4})|(?:[a-z]+\s+\d{4})|(?:\d{4}-\d{2}(?:-\d{2})?))/i,
  );
  const visiblePublished = parseSourceDate(visiblePublicationLabel?.[1]);
  if (visiblePublished) return visiblePublished;

  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="dcterms.issued"]',
    'meta[itemprop="datePublished"]',
  ];
  for (const selector of metaSelectors) {
    const value = parseSourceDate($(selector).attr('content'));
    if (value) return value;
  }

	let published: ParsedSourceDate | null = null;
	$('time[datetime]').each((_index, element) => {
		if (published) return;
		const time = $(element);
		const itemProp = time.attr('itemprop')?.toLowerCase();
		const attributeContext = [
			time.attr('class'),
			time.attr('id'),
			time.attr('aria-label'),
			time.attr('title'),
			time.parent().attr('class'),
			time.parent().attr('id'),
		]
			.filter(Boolean)
			.join(' ');
		const parentLabel = time
			.parent()
			.clone()
			.children()
			.remove()
			.end()
			.text();
		const context = `${attributeContext} ${time.prev().text()} ${parentLabel} ${time.text()}`;
		const explicitlyPublished =
			itemProp === 'datepublished' ||
			/\b(?:published|publication|date\s+issued|issued\s+on|release\s+date)\b/i.test(
				context,
			);
		const conflictingLabel =
			/\b(?:updated|modified|reviewed|deadline|closing|closes?|event\s+date|effective)\b/i.test(
				context,
			);
		if (!explicitlyPublished || (conflictingLabel && itemProp !== 'datepublished')) {
			return;
		}
		published = parseSourceDate(time.attr('datetime'));
	});
	if (published) return published;

	for (const selector of [
		'meta[name="dcterms.date"]',
		'meta[name="date"]',
	]) {
		const value = parseSourceDate($(selector).attr('content'));
		if (value) return value;
	}
	return null;
}

/**
 * Represent a directly monitored instrument page as a candidate when its
 * stable content hash changes. Unlike index extraction, this never treats the
 * page's navigation or related links as separate developments.
 */
export function extractDocumentCandidate(
  html: string,
  url: string,
  fallbackTitle: string,
): Candidate {
  const $ = cheerio.load(html);
  const rawTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text() ||
    $('title').first().text() ||
    fallbackTitle;
  const title = cleanScrapedLinkTitle(rawTitle) || fallbackTitle;
  const text = extractSemanticDocumentText(html).slice(0, 600);

  const published = extractPublishedDateEvidence(html);
  return {
    url,
    title,
    text,
    dateHint: published?.date,
    dateHintPrecision: published?.precision,
  };
}

export function extractSemanticDocumentText(html: string): string {
  const $ = cheerio.load(html);
  let container = $('main').first();
  if (container.length === 0) container = $('[role="main"]').first();
  if (container.length === 0) container = $('article').first();
  if (container.length === 0) container = $('body').first();
  if (container.is('body')) container.children('header').remove();
  container
    .find('nav, footer, aside, script, style, noscript, svg')
    .remove();
  return container
    .text()
    .replace(/\s+/g, ' ')
    .trim();
}
