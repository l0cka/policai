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
