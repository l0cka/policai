import * as cheerio from 'cheerio';
import type { SourceEvidence } from '@/types';
import type { BillEvent, Chamber } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * Reads the stage table of a Parliament of Tasmania bill page
 * (`/bills/billsYYYY/<slug>`), which answers plain HTTP. One table holds both
 * Houses side by side: House of Assembly stages and dates in the first two
 * columns, Legislative Council stages and dates in the last two. A blank
 * date means the bill has not reached that stage. The "Amended" row reads
 * "Yes" when the House amended the bill, and the Council column's "Act" row
 * gives the Act number once assented.
 */

const HOUSES: { chamber: Chamber; stage: number; date: number }[] = [
  { chamber: 'lower', stage: 0, date: 1 },
  { chamber: 'upper', stage: 2, date: 3 },
];

/** Stages that do not move a bill through its lifecycle. */
const PROCEDURAL = new Set([
  'resumed',
  '2nd reading moved',
  '2nd reading agreed',
  '2nd reading committed',
  'committee',
  'reported',
  'amended',
  'lc amendments agreed to',
  'act',
]);

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "07/05/2026" → "2026-05-07". */
function stageDate(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(squash(text));
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

export function parseTasBillProgress(html: string, source: SourceEvidence): RegisterReading<BillEvent> {
  const $ = cheerio.load(html);
  const rows = $('main table')
    .filter((_, table) => /house of assembly - stage/i.test($(table).find('thead').text()))
    .first()
    .find('tbody tr')
    .map((_, row) =>
      [
        $(row)
          .children('td')
          .map((_, cell) => {
            const copy = $(cell).clone();
            copy.find('sup').remove();
            return squash(copy.text());
          })
          .get(),
      ],
    )
    .get() as string[][];
  /** The date-column cell beside a stage name, such as the Council's "Act" row. */
  const cell = (stage: string, column: number) => rows.find((row) => row[column - 1]?.toLowerCase() === stage)?.[column] ?? '';

  const dated: { date: string; event: BillEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];
  for (const { chamber, stage: stageColumn, date: dateColumn } of HOUSES) {
    const amended = /^yes$/i.test(cell('amended', dateColumn));
    for (const row of rows) {
      const stage = row[stageColumn] ?? '';
      const name = stage.toLowerCase();
      const date = stageDate(row[dateColumn] ?? '');
      if (!name || !date) continue;
      if (name === 'first reading') {
        dated.push({ date, event: { kind: 'introduced', chamber } });
      } else if (name === 'third reading') {
        dated.push({ date, event: { kind: 'passed', chamber, ...(amended ? { withAmendments: true } : {}) } });
      } else if (name === 'negatived') {
        dated.push({ date, event: { kind: 'negatived', chamber } });
      } else if (name === 'royal assent') {
        const act = /(\d+)\s+of\s+(\d{4})/i.exec(cell('act', 3));
        if (act) dated.push({ date, event: { kind: 'assented', actCitation: `Act No. ${act[1]} of ${act[2]}` } });
        else unrecognised.push({ chamber: null, stage, date });
      } else if (!PROCEDURAL.has(name)) {
        unrecognised.push({ chamber, stage, date });
      }
    }
  }

  // The second House's first reading is the bill arriving there, not its introduction.
  const introductions = dated.filter(({ event }) => event.kind === 'introduced').sort((a, b) => a.date.localeCompare(b.date));
  const arrivals = new Set(introductions.slice(1));
  const title = squash($('main h1').first().text()) || null;
  return {
    title,
    events: dated
      .filter((entry) => !arrivals.has(entry))
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }) => ({ date, precision: 'day' as const, event, source })),
    unrecognised,
  };
}
