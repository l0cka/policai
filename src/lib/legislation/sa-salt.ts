import type { Candidate, ExtractionResult } from '@/lib/pipeline/extract';
import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';
import { canonicalizeSourceUrl } from '@/lib/source-url';
import type { SourceEvidence } from '@/types';
import type { BillEvent, Chamber } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * South Australia's Parliament publishes bills through SALT, a JSON API
 * behind its bill pages, which answers plain HTTP and has no robots rules.
 * The bill pages at salt.parliament.sa.gov.au render client-side, so a
 * record cites the page and the collector reads the API.
 *
 * The search returns every bill of one session when motionType is left out
 * (motionType=0 adds motions). A date window drops bills SALT holds without
 * an introduction date, so the URL has none. A new session needs its name
 * here.
 */

const SALT_API = 'https://prod-internet-salt-functionapp.azurewebsites.net/api';
const SA_SESSION = '56th/1st';

export function saBillSearch(): string {
  return canonicalizeSourceUrl(`${SALT_API}/Search/?resultsPerPage=4000&parliamentSession=${SA_SESSION}`);
}

export function saBillPage(billId: number | string): string {
  return `https://salt.parliament.sa.gov.au/bill/${billId}`;
}

export const SA_BILL_PAGE = /^https:\/\/salt\.parliament\.sa\.gov\.au\/bill\/(\d+)$/;

/** Both Houses' rows for a bill, whichever House's bill id is asked for. */
export function saBillSummaries(billId: string): string {
  return `${SALT_API}/GetBillSummaries?billId=${billId}`;
}

/** SALT writes a missing date as "0001-01-01T00:00:00". */
function day(value: unknown): string | null {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return match && !match[1].startsWith('0001') ? match[1] : null;
}

function list(json: string, what: string): Record<string, unknown>[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error(`the SALT ${what} response is not a list`);
  return raw as Record<string, unknown>[];
}

/**
 * Each bill of the session whose title names AI, as a candidate citing its
 * bill page. A bill passed by one House is listed again under the other
 * House's bill id, so only its first listing is kept. SALT titles drop the
 * "Bill YYYY" suffix, which is restored from the introduction year.
 */
export function extractFromSaltSearch(json: string): ExtractionResult {
  const rows = list(json, 'search');
  const bills = rows
    .filter((row) => row.type === 'Bill' && typeof row.resultId === 'number' && typeof row.title === 'string')
    .map((row) => ({ id: row.resultId as number, name: (row.title as string).replace(/\s+/g, ' ').trim(), introduced: day(row.dateIntroduced), row }))
    .sort((a, b) => a.id - b.id);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const { id, name, introduced, row } of bills) {
    if (seen.has(name)) continue;
    seen.add(name);
    const title = introduced ? `${name} Bill ${introduced.slice(0, 4)}` : `${name} Bill`;
    const url = saBillPage(id);
    const text = `Introduced in the ${String(row.fullHouse)}${row.introducedBy ? ` by ${String(row.introducedBy)}` : ''}; SALT status: ${String(row.status ?? 'unknown')}.`;
    if (!isRelevantScrapedCandidate({ title, url, text })) continue;
    candidates.push({ url, title, text, ...(introduced ? { dateHint: introduced, dateHintPrecision: 'day' as const } : {}) });
  }
  return { itemCount: rows.length, candidates, feedValid: true };
}

const CHAMBERS: Record<number, Chamber> = { 1: 'lower', 2: 'upper' };

/** Statuses that leave a House's row before its third reading. */
const IN_PROGRESS = new Set(['1st reading', '2nd reading', 'adj 2nd reading', 'in committee']);

/**
 * Reads GetBillSummaries: one row per House, each under that House's own
 * bill id, whichever id is asked for. The House the bill started in
 * gives its introduction; the other House's first reading is its arrival.
 * A House passed the bill when its row has a third reading date and a
 * passed, awaiting-assent or assented status. A negative vote has only the
 * row's completion date.
 *
 * Assent is dated only when every row is assented on the same completion
 * date with one Act number: SALT copies the assented status to both Houses
 * but keeps each House's own completion date (Employment Agents, Act 13 of
 * 2026, shows two), and the two Acts checked against their assent notes
 * (19 of 2025, 67 of 2024) had one date on every row. Otherwise the reviewer
 * reads the assent from the Act, told every Act number the rows give (the
 * Return to Work bill's rows say 6 and 7 of 2026).
 */
export function parseSaBillSummaries(json: string, source: SourceEvidence): RegisterReading<BillEvent> {
  const rows = list(json, 'bill summary');
  const dated: { date: string; event: BillEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];
  for (const row of rows) {
    const chamber = CHAMBERS[row.houseID as number];
    if (!chamber) throw new Error(`the SALT bill summary names an unknown House (${String(row.houseID)})`);
    const status = String(row.statusText ?? '').trim();
    const completed = day(row.dateCompleted);
    const introduced = day(row.dateIntroduced);
    if (row.referenceType === 0 && introduced) dated.push({ date: introduced, event: { kind: 'introduced', chamber } });
    if (/^negatived\b/i.test(status)) {
      if (completed) dated.push({ date: completed, event: { kind: 'negatived', chamber } });
      continue;
    }
    const thirdReading = day(row.thirdReadingDate);
    if (thirdReading && /^(?:passed|awaiting assent|assented)\b/i.test(status)) {
      dated.push({ date: thirdReading, event: { kind: 'passed', chamber, ...(/with amendments/i.test(status) ? { withAmendments: true } : {}) } });
    }
    if (!/^(?:passed|awaiting assent|assented)\b/i.test(status) && !IN_PROGRESS.has(status.toLowerCase()) && completed) {
      unrecognised.push({ chamber, stage: status, date: completed });
    }
  }
  const assented = rows.filter((row) => /^assented$/i.test(String(row.statusText ?? '').trim()));
  if (assented.length > 0) {
    const acts = new Set(assented.map((row) => (typeof row.actNumber === 'number' && row.actNumber > 0 ? `Act No. ${row.actNumber} of ${String(row.yearOfAct)}` : '')));
    const dates = new Set(rows.map((row) => day(row.dateCompleted)));
    const [date] = dates;
    const latest = [...dates].filter((value): value is string => value !== null).sort().at(-1);
    const named = [...acts].filter(Boolean).sort();
    if (assented.length === rows.length && acts.size === 1 && named.length === 1 && dates.size === 1 && date) {
      dated.push({ date, event: { kind: 'assented', actCitation: named[0] } });
    } else if (latest) {
      unrecognised.push({ chamber: null, stage: named.length > 0 ? `Assented as ${named.join(' or ')}, date not confirmed` : 'Assented', date: latest });
    }
  }
  const title = rows.find((row) => row.referenceType === 0)?.title;
  return {
    title: typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : null,
    events: dated
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }) => ({ date, precision: 'day' as const, event, source })),
    unrecognised,
  };
}
