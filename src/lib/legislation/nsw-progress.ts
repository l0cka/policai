import type { SourceEvidence } from '@/types';
import type { BillEvent, Chamber } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * Reads a NSW Parliament bill-details page, served only to a browser. The
 * page embeds its data as `__PIMS_BILL_DETAIL__ = {…}`: the originating
 * House, the Act number, and a progress list per House ("Legislative
 * Assembly", "Legislative Council", "Assent information") of stage names and
 * dates such as "Tue 07 April 2026". A bill that lapsed or was withdrawn
 * says so in `billStatus`, dated by `dateCanonical`; a negatived bill goes to
 * the reviewer, since the data does not say which House voted it down. A bill
 * never introduced (a withdrawn notice of motion) has no lifecycle, so its
 * status goes to the reviewer too.
 */

const CHAMBERS: Record<string, Chamber> = { 'Legislative Assembly': 'lower', 'Legislative Council': 'upper' };

/** Stages that do not move a bill through its lifecycle. */
const PROCEDURAL = [
  /^introduced by$/,
  /^notice of motion$/,
  /^first reading$/,
  /^2r speech$/,
  /^second reading$/,
  /^considered in detail$/,
  /^date committed$/,
  /^passed w'?out amdt$/,
  /^passed with amdts?$/,
  /^date passed (?:la|lc)$/,
  /^reported (?:with|without) amendments?$/,
  /^returned to (?:la|lc)$/,
  /^passed parliament$/,
  /^(?:la|lc) sent to governor$/,
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "Tue 07 April 2026" → "2026-04-07". */
function stageDate(text: string): string | null {
  const match = /(\d{1,2}) ([a-z]+) (\d{4})$/i.exec(text.trim());
  const month = match ? MONTHS.indexOf(match[2].toLowerCase()) + 1 : 0;
  return match && month > 0 ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

interface BillDetail {
  shortTitle?: string;
  originatingHouse?: string;
  billStatus?: string;
  dateCanonical?: string;
  actNumber?: number;
  actYear?: number;
  progress?: Record<string, { key?: string; value?: string }[]>;
}

function billDetail(html: string): BillDetail {
  const start = html.indexOf('__PIMS_BILL_DETAIL__=');
  if (start < 0) throw new Error('the NSW bill page has no bill data');
  const text = html.slice(start + '__PIMS_BILL_DETAIL__='.length);
  return JSON.parse(text.slice(0, jsonEnd(text))) as BillDetail;
}

/** The end of the JSON object at the start of `text`. */
function jsonEnd(text: string): number {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return index + 1;
  }
  throw new Error('the NSW bill data is cut off');
}

export function parseNswBillDetail(html: string, source: SourceEvidence): RegisterReading<BillEvent> {
  const detail = billDetail(html);
  const dated: { date: string; event: BillEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];
  for (const [house, stages] of Object.entries(detail.progress ?? {})) {
    const chamber = CHAMBERS[house] ?? null;
    const amended = (stages ?? []).some(({ key }) => /^passed with amdt|amended$/i.test(key ?? ''));
    for (const { key = '', value = '' } of stages ?? []) {
      const date = stageDate(value);
      if (!date) continue;
      const name = key.trim().toLowerCase();
      if (chamber && name === 'introduced') {
        // The second House's introduction is the bill arriving there.
        if (house === detail.originatingHouse) dated.push({ date, event: { kind: 'introduced', chamber } });
      } else if (chamber && name === 'third reading') {
        dated.push({ date, event: { kind: 'passed', chamber, ...(amended ? { withAmendments: true } : {}) } });
      } else if (!chamber && name === 'assented') {
        if (detail.actNumber && detail.actYear) dated.push({ date, event: { kind: 'assented', actCitation: `Act No. ${detail.actNumber} of ${detail.actYear}` } });
        else unrecognised.push({ chamber: null, stage: key, date });
      } else if (!PROCEDURAL.some((pattern) => pattern.test(name))) {
        unrecognised.push({ chamber, stage: key, date });
      }
    }
  }
  const ended = /^\d{4}-\d{2}-\d{2}$/.test(detail.dateCanonical ?? '') ? detail.dateCanonical : undefined;
  const status = (detail.billStatus ?? '').toLowerCase();
  const introduced = dated.some(({ event }) => event.kind === 'introduced');
  if (ended && introduced && status.startsWith('lapsed')) dated.push({ date: ended, event: { kind: 'lapsed' } });
  else if (ended && introduced && status === 'withdrawn') dated.push({ date: ended, event: { kind: 'withdrawn' } });
  else if (ended && (status === 'negatived' || status === 'withdrawn')) unrecognised.push({ chamber: null, stage: detail.billStatus ?? '', date: ended });
  return {
    title: detail.shortTitle?.trim() || null,
    events: dated
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }) => ({ date, precision: 'day' as const, event, source })),
    unrecognised,
  };
}
