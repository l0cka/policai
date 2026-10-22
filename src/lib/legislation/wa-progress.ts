import * as cheerio from 'cheerio';
import type { SourceEvidence } from '@/types';
import type { BillEvent, Chamber } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * Reads a WA Parliament bill progress page (`BillProgressPopup`), served
 * only to a browser. One table per House (`table.tableLA`, `table.tableLC`)
 * lists stages and dates such as "07 May 2026"; the House introduced first
 * is the originating House. Assent appears only in the Status field:
 * "Royal Assent given 19 Aug 2026 as Act No. 10 of 2026". The page marks no
 * amendments, so passage never carries `withAmendments`.
 */

const TABLES: { selector: string; chamber: Chamber }[] = [
  { selector: 'table.tableLA', chamber: 'lower' },
  { selector: 'table.tableLC', chamber: 'upper' },
];

/** Stages that do not move a bill through its lifecycle. */
const PROCEDURAL = [/^first reading$/, /^second reading(?: agreed)?$/, /^consideration in detail$/, /^committee of the whole$/];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "07 May 2026" → "2026-05-07". */
function stageDate(text: string): string | null {
  const match = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/i.exec(text);
  const month = match ? MONTHS.indexOf(match[2].toLowerCase()) + 1 : 0;
  return match && month > 0 ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

export function parseWaBillProgress(html: string, source: SourceEvidence): RegisterReading<BillEvent> {
  const $ = cheerio.load(html);
  const dated: { date: string; event: BillEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];
  const introductions: { date: string; event: BillEvent }[] = [];
  for (const { selector, chamber } of TABLES) {
    $(selector)
      .find('tr')
      .each((_, row) => {
        const cells = $(row).children('td');
        if (cells.length !== 2) return;
        const stage = squash(cells.eq(0).text());
        const date = stageDate(squash(cells.eq(1).text()));
        if (!date) return;
        const name = stage.toLowerCase();
        if (name === 'introduced') introductions.push({ date, event: { kind: 'introduced', chamber } });
        else if (name === 'third reading') dated.push({ date, event: { kind: 'passed', chamber } });
        else if (!PROCEDURAL.some((pattern) => pattern.test(name))) unrecognised.push({ chamber, stage, date });
      });
  }
  // The second House's introduction is the bill arriving there.
  const [origin] = introductions.sort((a, b) => a.date.localeCompare(b.date));
  if (origin) dated.push(origin);
  const status = squash(
    $('td.fieldDesc')
      .filter((_, cell) => squash($(cell).text()) === 'Status')
      .next('td')
      .text(),
  );
  const assent = /Royal Assent given (\d{1,2} [A-Za-z]{3} \d{4}) as Act No\. (\d+) of (\d{4})/.exec(status);
  const assentDate = assent ? stageDate(assent[1]) : null;
  if (assent && assentDate) dated.push({ date: assentDate, event: { kind: 'assented', actCitation: `Act No. ${assent[2]} of ${assent[3]}` } });
  return {
    title: squash($('h1').first().text()) || null,
    events: dated
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }) => ({ date, precision: 'day' as const, event, source })),
    unrecognised,
  };
}
