import type { Candidate, ExtractionResult } from '@/lib/pipeline/extract';
import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';
import { canonicalizeSourceUrl } from '@/lib/source-url';

/**
 * Discovers Victorian bills through the search index behind Victorian
 * Legislation's "bills in Parliament" page, which renders client-side. The
 * index answers a plain GET with a query string: every bill flagged as
 * before the current Parliament, 46 on 22 Oct 2026. A long query in the
 * `source` parameter trips the site's firewall, so this one stays short.
 */

const SITE = 'https://www.legislation.vic.gov.au';

export function vicBillSearch(): string {
  return canonicalizeSourceUrl(
    `${SITE}/api/tide/elasticsearch/content-legislation-vic-gov-au__production__sapi_node/_search?q=type:bill%20AND%20field_bill_parliament_current:true&size=100&_source_excludes=es_attachment,rendered_item`,
  );
}

/** A bill page, which answers plain HTTP and carries the bill's stage history. */
export const VIC_BILL_PAGE = /^https:\/\/www\.legislation\.vic\.gov\.au\/bills\/[a-z0-9-]+$/;

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : undefined);

/**
 * Each current bill whose title names AI, as a candidate citing its bill
 * page. The index gives no introduction date; the page's creation date is
 * the closest it has.
 */
export function extractFromVicBillSearch(json: string): ExtractionResult {
  const raw: unknown = JSON.parse(json);
  const hits = (raw as { hits?: { hits?: unknown } } | null)?.hits?.hits;
  if (!Array.isArray(hits)) throw new Error('the Victorian Legislation search response has no hits');
  const candidates: Candidate[] = [];
  for (const hit of hits as { _source?: Record<string, unknown> }[]) {
    const title = first(hit._source?.title);
    const path = first(hit._source?.url);
    if (typeof title !== 'string' || typeof path !== 'string') continue;
    const url = `${SITE}${path.replace(/^\/site-\d+/, '')}`;
    const status = first(hit._source?.field_legislation_status);
    const text = `Before the Victorian Parliament${typeof status === 'string' ? `; status: ${status}` : ''}.`;
    if (!VIC_BILL_PAGE.test(url) || !isRelevantScrapedCandidate({ title, url, text })) continue;
    const created = first(hit._source?.created);
    const day = typeof created === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(created)?.[0] : undefined;
    candidates.push({ url, title: title.trim(), text, ...(day ? { dateHint: day, dateHintPrecision: 'day' as const } : {}) });
  }
  return { itemCount: hits.length, candidates, feedValid: true };
}
