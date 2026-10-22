import type { Candidate, ExtractionResult } from '@/lib/pipeline/extract';
import { canonicalizeSourceUrl } from '@/lib/source-url';
import type { Policy } from '@/types';

/**
 * Discovers new AI-related legislative instruments through the Federal
 * Register of Legislation's full-text search. Instrument titles rarely name
 * AI (ASIC's AI trading rules are "Market Integrity Rules … Amendment"), so
 * a title filter over the register's what's-new list never found them.
 *
 * The search returns the newest as-made instruments first with no date
 * window, so the URL is fixed. It gives no snippet, only a relevance score.
 * With or() the score sums across the phrases matched: passing mentions
 * scored 4 to 13 and AI-related instruments 20 to 27 in a probe of the 20
 * newest results (22 Oct 2026). The score varies by about ±1 between
 * identical requests, so the cut sits between the two bands.
 */

const AI_PHRASES = ['artificial intelligence', 'machine learning', 'generative AI', 'automated decision'];
const FRL_MIN_RELEVANCE = 17;

export function frlAiInstrumentSearch(): string {
  const terms = AI_PHRASES.map((phrase) => `text(%22${phrase.replace(/ /g, '%20')}%22,nameAndText,contains)`).join(',');
  const criteria = `and(or(${terms}),collection(LegislativeInstrument))`;
  return canonicalizeSourceUrl(
    `https://api.prod.legislation.gov.au/v1/Titles/Search(criteria='${criteria}')?$top=20&$orderby=asMadeRegisteredAt%20desc&$expand=searchContexts($expand=fullTextVersion)`,
  );
}

/** The register page a candidate and a legislation record both cite. */
function frlRecordPage(titleId: string): string {
  return `https://www.legislation.gov.au/${titleId}/asmade/details`;
}

/**
 * Register pages of instruments already tracked, so a match is not proposed
 * again when the record cites the issuer's release rather than the register.
 */
export function trackedFrlPages(policies: readonly Policy[]): string[] {
  return policies.flatMap(({ legislative }) => (legislative?.ref.register === 'frl' ? [frlRecordPage(legislative.ref.titleId)] : []));
}

interface FrlSearchRow {
  id?: unknown;
  name?: unknown;
  asMadeRegisteredAt?: unknown;
  searchContexts?: { fullTextVersion?: { isAsMade?: unknown; relevance?: unknown } | null } | null;
}

/**
 * Each instrument whose as-made text matched strongly enough, as a candidate
 * citing its register page. A later compilation that matched is skipped:
 * the instrument that brought the AI text in is the one to review.
 */
export function extractFromFrlSearch(json: string): ExtractionResult {
  const raw: unknown = JSON.parse(json);
  const value = raw && typeof raw === 'object' ? (raw as { value?: unknown }).value : undefined;
  if (!Array.isArray(value)) throw new Error('the Federal Register response is not a list of titles');
  const rows = value as FrlSearchRow[];
  const candidates: Candidate[] = [];
  for (const row of rows) {
    const version = row.searchContexts?.fullTextVersion;
    if (typeof row.id !== 'string' || typeof row.name !== 'string' || version?.isAsMade !== true) continue;
    if (typeof version.relevance !== 'number' || version.relevance < FRL_MIN_RELEVANCE) continue;
    const registered = typeof row.asMadeRegisteredAt === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(row.asMadeRegisteredAt)?.[0] : undefined;
    candidates.push({
      url: frlRecordPage(row.id),
      title: row.name,
      text: `Federal Register full-text search for ${AI_PHRASES.map((phrase) => `"${phrase}"`).join(', ')} matched this instrument as made (relevance ${version.relevance.toFixed(1)}).`,
      ...(registered ? { dateHint: registered, dateHintPrecision: 'day' as const } : {}),
    });
  }
  return { itemCount: rows.length, candidates, feedValid: true };
}
