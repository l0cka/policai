import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legislativePhase, type Dated, type Legislative, type LegislativeEvent } from './model';
import { parseTasBillProgress } from './tas-progress';

const COMMISSION = 'https://www.parliament.tas.gov.au/bills/bills2026/commission-of-inquiry-miscellaneous-amendments-bill-2026-25-of-2026';
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/state', `tas-bill-${name}.html`), 'utf8');

/** Fills the empty date cell of a stage row, in the House of Assembly (first) or Legislative Council (second) column. */
function withStage(html: string, stage: string, house: 0 | 1, value: string): string {
  const rows = html.split('<tr>');
  const index = rows.findIndex((row) => row.includes(`<td>${stage}`));
  const cells = rows[index].split('<td>');
  const dateCell = house === 0 ? 2 : 4;
  cells[dateCell] = cells[dateCell].replace(/(&nbsp;|\s)*\s*<\/td>/, `${value}</td>`);
  rows[index] = cells.join('<td>');
  return rows.join('<tr>');
}

function bill(events: Dated<LegislativeEvent>[]): Legislative {
  return {
    kind: 'bill',
    ref: { register: 'state', jurisdiction: 'tas', url: COMMISSION },
    origin: 'government',
    events: events as Extract<Legislative, { kind: 'bill' }>['events'],
  };
}

describe('parseTasBillProgress', () => {
  it('reads the first reading as the introduction, citing the bill page', () => {
    const reading = parseTasBillProgress(fixture('commission-of-inquiry-2026'), { url: COMMISSION });
    expect(reading.title).toBe('Commission of Inquiry (Miscellaneous Amendments) Bill 2026 (25 of 2026)');
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([['2026-08-11', { kind: 'introduced', chamber: 'lower' }]]);
    expect(reading.events[0].source).toEqual({ url: COMMISSION });
    expect(reading.unrecognised).toEqual([]);
  });

  it('reads passage through both Houses, a Council amendment, and assent with the Act number', () => {
    let html = fixture('crown-lands-treasury-complex-2026');
    html = withStage(html, 'Third reading', 0, '18/08/2026');
    html = withStage(html, 'First reading', 1, '18/08/2026');
    html = withStage(html, 'Amended <sup>#</sup>', 1, 'Yes');
    html = withStage(html, 'Third reading', 1, '10/09/2026');
    html = withStage(html, 'Royal Assent', 0, '01/10/2026');
    html = html.replace(/<td>Act <\/td>(\s*)<td>&nbsp;<\/td>/, '<td>Act </td>$1<td>No. 31 of 2026</td>');
    const reading = parseTasBillProgress(html, { url: COMMISSION });
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([
      ['2026-05-07', { kind: 'introduced', chamber: 'lower' }],
      ['2026-08-18', { kind: 'passed', chamber: 'lower' }],
      ['2026-09-10', { kind: 'passed', chamber: 'upper', withAmendments: true }],
      ['2026-10-01', { kind: 'assented', actCitation: 'Act No. 31 of 2026' }],
    ]);
    expect(reading.unrecognised).toEqual([]);
    expect(legislativePhase(bill(reading.events), 'tas')).toBe('made');
  });

  it('shows assent without an Act number to a reviewer instead of guessing it', () => {
    const html = withStage(fixture('crown-lands-treasury-complex-2026'), 'Royal Assent', 0, '01/10/2026');
    expect(parseTasBillProgress(html, { url: COMMISSION }).unrecognised).toEqual([{ chamber: null, stage: 'Royal Assent', date: '2026-10-01' }]);
  });
});
