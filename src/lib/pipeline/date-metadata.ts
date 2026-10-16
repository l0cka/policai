import type { CheerioAPI } from 'cheerio';

type MetaAttribute = 'name' | 'property' | 'itemprop';
type DateMetaField = readonly [attribute: MetaAttribute, key: string];

export type DateMetaPlatform = 'govcms' | 'generic';

const PUBLICATION_DATE_META: readonly DateMetaField[] = [
  ['name', 'dcterms.created'],
  ['name', 'dcterms.issued'],
  ['property', 'article:published_time'],
  ['itemprop', 'datePublished'],
];

const LAST_RESORT_DATE_META: Record<DateMetaPlatform, readonly DateMetaField[]> = {
  govcms: [],
  generic: [
    ['name', 'dcterms.date'],
    ['name', 'date'],
  ],
};

const metaSelector = ([attribute, key]: DateMetaField) =>
  `meta[${attribute}="${key}"]`;

export const PUBLICATION_DATE_META_SELECTORS =
  PUBLICATION_DATE_META.map(metaSelector);

export const LAST_RESORT_DATE_META_SELECTORS: Record<
  DateMetaPlatform,
  readonly string[]
> = {
  govcms: LAST_RESORT_DATE_META.govcms.map(metaSelector),
  generic: LAST_RESORT_DATE_META.generic.map(metaSelector),
};

export function detectDateMetaPlatform($: CheerioAPI): DateMetaPlatform {
  const generator = $('meta[name="generator" i]').attr('content') ?? '';
  return /govcms|drupal/i.test(generator) ? 'govcms' : 'generic';
}

export interface PublicationDateCandidate {
  readonly source: string;
  readonly value: string;
}

const VISIBLE_PUBLICATION_LABEL =
  /\b(?:date\s+published|published(?:\s+on)?|publication\s+date|date\s+issued|issued\s+on|release\s+date)\s*:?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*((?:\d{1,2}\s+[a-z]+\s+\d{4})|(?:[a-z]+\s+\d{4})|(?:\d{4}-\d{2}(?:-\d{2})?))/i;
const PUBLISHED_TIME_CONTEXT =
  /\b(?:published|publication|date\s+issued|issued\s+on|release\s+date)\b/i;
const CONFLICTING_TIME_CONTEXT =
  /\b(?:updated|modified|reviewed|deadline|closing|closes?|event\s+date|effective)\b/i;

export function publicationDateCandidates(
  $: CheerioAPI,
): PublicationDateCandidate[] {
  const candidates: PublicationDateCandidate[] = [];
  const metaCandidates = (selectors: readonly string[]) => {
    for (const selector of selectors) {
      const value = $(selector).attr('content');
      if (value !== undefined) candidates.push({ source: selector, value });
    }
  };

  const visibleContainer = $('main, article, [role="main"]').first();
  const visibleText = (visibleContainer.length > 0 ? visibleContainer : $('body'))
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const label = VISIBLE_PUBLICATION_LABEL.exec(visibleText)?.[1];
  if (label !== undefined) candidates.push({ source: 'label', value: label });

  metaCandidates(PUBLICATION_DATE_META_SELECTORS);

  $('time[datetime]').each((_index, element) => {
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
      itemProp === 'datepublished' || PUBLISHED_TIME_CONTEXT.test(context);
    const conflictingLabel = CONFLICTING_TIME_CONTEXT.test(context);
    if (!explicitlyPublished || (conflictingLabel && itemProp !== 'datepublished')) {
      return;
    }
    candidates.push({ source: 'time', value: time.attr('datetime') ?? '' });
  });

  metaCandidates(LAST_RESORT_DATE_META_SELECTORS[detectDateMetaPlatform($)]);
  return candidates;
}

export const LEGACY_FINGERPRINT_METADATA_KEYS: ReadonlySet<string> = new Set([
  'article:published_time',
  'article:modified_time',
  'date',
  'datepublished',
  'dcterms.date',
  'dcterms.issued',
  'dcterms.modified',
  'dc.date',
  'og:title',
  'citation_title',
  'citation_publication_date',
]);

export const FINGERPRINT_METADATA_KEYS: ReadonlySet<string> = new Set([
  ...LEGACY_FINGERPRINT_METADATA_KEYS,
  ...[...PUBLICATION_DATE_META, ...Object.values(LAST_RESORT_DATE_META).flat()]
    .map(([, key]) => key.toLowerCase()),
]);
