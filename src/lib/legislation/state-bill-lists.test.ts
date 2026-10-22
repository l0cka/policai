import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFromBillList } from './state-bill-lists';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/state', name), 'utf8');

const NT = 'https://legislation.nt.gov.au/en/LegislationPortal/Bills/Before-Legislative-Assembly';
const QLD = 'https://www.parliament.qld.gov.au/Work-of-the-Assembly/Bills-and-Legislation/Bills-before-the-House';
const NSW = 'https://www.parliament.nsw.gov.au/parliamentary-business/bills/current-session-bills?num_ranks=1000';
const WA = 'https://www.parliament.wa.gov.au/parliament/bills.nsf/screenWebCurrentBills?Count=200&OpenForm=';

describe('extractFromBillList', () => {
  it('reads every bill on each list and keeps none, since no current title names AI', () => {
    expect(extractFromBillList('nt', fixture('nt-bills-before-assembly.html'), NT)).toEqual({ itemCount: 5, candidates: [], feedValid: true });
    expect(extractFromBillList('qld', fixture('qld-bills-before-the-house.html'), QLD)).toEqual({ itemCount: 17, candidates: [], feedValid: true });
    expect(extractFromBillList('wa', fixture('wa-current-bills.html'), WA)).toEqual({ itemCount: 30, candidates: [], feedValid: true });
  });

  it('keeps an AI-titled NT bill, citing its register link', () => {
    const html = fixture('nt-bills-before-assembly.html').replace('>Private Hospitals Amendment Bill 2026<', '>Criminal Code Amendment (Artificial Intelligence) Bill 2026<');
    expect(extractFromBillList('nt', html, NT).candidates).toEqual([
      {
        url: 'https://legislation.nt.gov.au/~/link.aspx?_id=2028CE3EECAA4D9C8D9037A6E88E0439&_z=z',
        title: 'Criminal Code Amendment (Artificial Intelligence) Bill 2026',
        text: 'Before the NT Legislative Assembly.',
      },
    ]);
  });

  it('keeps an AI-titled Queensland bill, citing its tabled text, with its introduction date and stage', () => {
    const html = fixture('qld-bills-before-the-house.html').replace(
      '>Breach Bail, Go to Jail and Other Legislation Amendment Bill 2026<',
      '>Criminal Code (Deepfake Material) Amendment Bill 2026<',
    );
    expect(extractFromBillList('qld', html, QLD).candidates).toEqual([
      {
        url: 'https://www.parliament.qld.gov.au/Work-of-the-Assembly/Tabled-Papers/docs/5826T1511/5826t1511.pdf',
        title: 'Criminal Code (Deepfake Material) Amendment Bill 2026',
        text: 'Introduced by Hon D Frecklington MP on 27/8/2026; stage reached: 2nd reading to be moved on 16/10/2026.',
        dateHint: '2026-08-27',
        dateHintPrecision: 'day',
      },
    ]);
  });

  it('keeps an AI-titled WA bill, citing its progress page, with its introduction date and stage', () => {
    const html = fixture('wa-current-bills.html').replace(
      '> Adoption Legislation Amendment (Integrated Birth Certificates) Bill 2026<',
      '> Digital Government Amendment (Automated Decision-Making) Bill 2026<',
    );
    expect(extractFromBillList('wa', html, WA).candidates).toEqual([
      {
        url: 'https://www.parliament.wa.gov.au/parliament/bills.nsf/BillProgressPopup?openForm&ParentUNID=DFDF22EAD7F3601148258E960017CBE5',
        title: 'Digital Government Amendment (Automated Decision-Making) Bill 2026',
        text: 'Legislative Assembly Second Reading - 21 Oct 2026.',
        dateHint: '2026-10-21',
        dateHintPrecision: 'day',
      },
    ]);
  });

  it('refuses a WA list that fills its page, since bills past it would be missed', () => {
    const page = 'https://www.parliament.wa.gov.au/parliament/bills.nsf/screenWebCurrentBills';
    expect(() => extractFromBillList('wa', fixture('wa-current-bills.html'), page)).toThrow('filled its page of 30 rows');
  });

  it('keeps the NSW deepfake bill from the whole session, citing its bill page rebuilt from the search redirect', () => {
    const result = extractFromBillList('nsw', fixture('nsw-current-session-bills.html'), NSW);
    expect(result.itemCount).toBe(544);
    expect(result.candidates).toEqual([
      {
        url: 'https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18782',
        title: 'Crimes Amendment (Deepfake Sexual Material) Bill 2025',
        text: 'Introduced in the Legislative Assembly; status: Lapsed in Accordance with Standing Orders, Fri 06 February 2026.',
      },
    ]);
  });

  it('refuses an NSW list that still offers more bills', () => {
    const html = fixture('nsw-current-session-bills.html').replace('</main>', '<div hx-get="/_design/rest-assets/funnelback/listing-pages-fb?start_rank=11"></div></main>');
    expect(() => extractFromBillList('nsw', html, NSW)).toThrow('offers more bills');
  });

  it('treats a page without its list as broken, not empty', () => {
    const loading = '<html><body><p>Loading…</p></body></html>';
    expect(extractFromBillList('nt', loading, NT)).toEqual({ itemCount: 0, candidates: [] });
    expect(extractFromBillList('qld', loading, QLD)).toEqual({ itemCount: 0, candidates: [] });
    expect(extractFromBillList('wa', loading, WA)).toEqual({ itemCount: 0, candidates: [] });
    expect(extractFromBillList('nsw', loading, NSW)).toEqual({ itemCount: 0, candidates: [] });
  });
});
