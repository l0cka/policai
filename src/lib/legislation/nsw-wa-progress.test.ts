import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legislativePhase, type Dated, type Legislative, type LegislativeEvent } from './model';
import { parseNswBillDetail } from './nsw-progress';
import { parseWaBillProgress } from './wa-progress';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/state', name), 'utf8');
const stages = (reading: { events: Dated<LegislativeEvent>[] }) => reading.events.map(({ date, event }) => [date, event]);

const NSW_BILL = 'https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18875';
const WA_ASSENTED = 'https://www.parliament.wa.gov.au/parliament/bills.nsf/BillProgressPopup?OpenForm=&ParentUNID=5107DFD50A7DA2E448258DEE0026841D';
const WA_PASSED = 'https://www.parliament.wa.gov.au/parliament/bills.nsf/BillProgressPopup?OpenForm=&ParentUNID=A97052A7F3DF8F5548258DA800203E8B';

function bill(jurisdiction: 'nsw' | 'wa', url: string, events: Dated<LegislativeEvent>[]): Legislative {
  return { kind: 'bill', ref: { register: 'state', jurisdiction, url }, origin: 'government', events: events as Extract<Legislative, { kind: 'bill' }>['events'] };
}

/** The NSW page with its embedded bill data changed. */
function nswWith(change: (detail: Record<string, unknown>) => void): string {
  const html = fixture('nsw-bill-18875.html');
  const start = html.indexOf('__PIMS_BILL_DETAIL__=') + '__PIMS_BILL_DETAIL__='.length;
  const end = html.indexOf('};', start) + 1;
  const detail = JSON.parse(html.slice(start, end));
  change(detail);
  return html.slice(0, start) + JSON.stringify(detail) + html.slice(end);
}

describe('parseNswBillDetail', () => {
  it('reads passage through both Houses and assent with the Act number from the embedded bill data', () => {
    const reading = parseNswBillDetail(fixture('nsw-bill-18875.html'), { url: NSW_BILL });
    expect(reading.title).toBe('Electoral Legislation Amendment (Elections) Bill 2026');
    expect(stages(reading)).toEqual([
      ['2026-03-17', { kind: 'introduced', chamber: 'lower' }],
      ['2026-03-25', { kind: 'passed', chamber: 'lower' }],
      ['2026-03-26', { kind: 'passed', chamber: 'upper' }],
      ['2026-04-07', { kind: 'assented', actCitation: 'Act No. 6 of 2026' }],
    ]);
    expect(reading.unrecognised).toEqual([]);
    expect(legislativePhase(bill('nsw', NSW_BILL, reading.events), 'nsw')).toBe('made');
  });

  it('reads a lapsed bill from its status, and leaves a negative vote to the reviewer', () => {
    const lapsed = nswWith((detail) => Object.assign(detail, { billStatus: 'Lapsed in Accordance with Standing Orders', dateCanonical: '2026-02-06' }));
    expect(stages(parseNswBillDetail(lapsed, { url: NSW_BILL }))).toContainEqual(['2026-02-06', { kind: 'lapsed' }]);
    const negatived = nswWith((detail) => Object.assign(detail, { billStatus: 'Negatived', dateCanonical: '2024-10-23' }));
    expect(parseNswBillDetail(negatived, { url: NSW_BILL }).unrecognised).toEqual([{ chamber: null, stage: 'Negatived', date: '2024-10-23' }]);
  });

  it('leaves the withdrawal of a bill never introduced to the reviewer', () => {
    const notice = nswWith((detail) =>
      Object.assign(detail, {
        billStatus: 'Withdrawn',
        dateCanonical: '2024-06-04',
        progress: { 'Legislative Council': [{ key: 'Notice of Motion', value: 'Tue 06 February 2024' }], 'Assent information': [] },
      }),
    );
    const reading = parseNswBillDetail(notice, { url: NSW_BILL });
    expect(reading.events).toEqual([]);
    expect(reading.unrecognised).toEqual([{ chamber: null, stage: 'Withdrawn', date: '2024-06-04' }]);
  });

  it('treats the rows restating passage, and committee reports, as procedural', () => {
    const amended = nswWith((detail) => {
      const progress = detail.progress as Record<string, { key: string; value: string }[]>;
      progress['Legislative Assembly'].push({ key: 'Passed with amdts', value: 'Wed 25 March 2026' });
      progress['Legislative Council'].push({ key: 'Date Passed LC', value: 'Thu 26 March 2026' }, { key: 'Reported without amendment', value: 'Thu 26 March 2026' });
    });
    const reading = parseNswBillDetail(amended, { url: NSW_BILL });
    expect(reading.events).toContainEqual(expect.objectContaining({ date: '2026-03-25', event: { kind: 'passed', chamber: 'lower', withAmendments: true } }));
    expect(reading.unrecognised).toEqual([]);
  });

  it('refuses a page without the bill data', () => {
    expect(() => parseNswBillDetail('<html><body>Just a moment…</body></html>', { url: NSW_BILL })).toThrow('no bill data');
  });
});

describe('parseWaBillProgress', () => {
  it('reads passage through both Houses and assent from the status field', () => {
    const reading = parseWaBillProgress(fixture('wa-bill-progress-5107DFD50A7DA2E448258DEE0026841D.html'), { url: WA_ASSENTED });
    expect(reading.title).toBe('Appropriation (Recurrent 2026–27) Bill 2026');
    expect(stages(reading)).toEqual([
      ['2026-05-07', { kind: 'introduced', chamber: 'lower' }],
      ['2026-06-09', { kind: 'passed', chamber: 'lower' }],
      ['2026-08-11', { kind: 'passed', chamber: 'upper' }],
      ['2026-08-19', { kind: 'assented', actCitation: 'Act No. 10 of 2026' }],
    ]);
    expect(reading.unrecognised).toEqual([]);
    expect(legislativePhase(bill('wa', WA_ASSENTED, reading.events), 'wa')).toBe('made');
  });

  it('reads a bill passed by both Houses and not yet assented, counting the Council introduction as its arrival', () => {
    expect(stages(parseWaBillProgress(fixture('wa-bill-progress-A97052A7F3DF8F5548258DA800203E8B.html'), { url: WA_PASSED }))).toEqual([
      ['2026-02-25', { kind: 'introduced', chamber: 'lower' }],
      ['2026-05-07', { kind: 'passed', chamber: 'lower' }],
      ['2026-10-13', { kind: 'passed', chamber: 'upper' }],
    ]);
  });

  it('shows a stage it does not know to a reviewer', () => {
    const html = fixture('wa-bill-progress-A97052A7F3DF8F5548258DA800203E8B.html').replace('<td>Consideration in Detail</td>', '<td>Discharged</td>');
    expect(parseWaBillProgress(html, { url: WA_PASSED }).unrecognised).toEqual([{ chamber: 'lower', stage: 'Discharged', date: '2026-05-07' }]);
  });
});
