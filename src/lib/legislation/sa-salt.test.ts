import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legislativePhase, type Dated, type Legislative, type LegislativeEvent } from './model';
import { extractFromSaltSearch, parseSaBillSummaries, saBillPage, saBillSearch } from './sa-salt';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/state', `sa-salt-${name}.json`), 'utf8');
const read = (name: string) => parseSaBillSummaries(fixture(name), { url: saBillPage(name.split('-')[1]) });
const stages = (name: string) => read(name).events.map(({ date, event }) => [date, event]);

function bill(events: Dated<LegislativeEvent>[]): Legislative {
  return {
    kind: 'bill',
    ref: { register: 'state', jurisdiction: 'sa', url: saBillPage(5619) },
    origin: 'government',
    events: events as Extract<Legislative, { kind: 'bill' }>['events'],
  };
}

/** A SALT search row, shaped as the search fixture's are. */
function searchRow(resultId: number, title: string, house: 'HA' | 'LC', dateIntroduced: string) {
  return {
    resultId,
    fullHouse: house === 'HA' ? 'House of Assembly' : 'Legislative Council',
    session: '56th/1st',
    house,
    type: 'Bill',
    title,
    dateIntroduced,
    introducedBy: 'Hon A Member',
    status: '1st Reading',
    billType: 2,
    billNumber: 40,
    motionType: -1,
  };
}

describe('saBillSearch', () => {
  it('asks SALT for every bill of the session, with no date window and no motions', () => {
    expect(saBillSearch()).toBe(
      'https://prod-internet-salt-functionapp.azurewebsites.net/api/Search?parliamentSession=56th%2F1st&resultsPerPage=4000',
    );
  });
});

describe('extractFromSaltSearch', () => {
  it('reads every row and keeps no bill of the session, since none is titled for AI', () => {
    const result = extractFromSaltSearch(fixture('search-56-1'));
    expect(result).toEqual({ itemCount: 220, candidates: [], feedValid: true });
  });

  it('keeps an AI-titled bill once, at its first House, with the Bill title restored', () => {
    const rows = [
      ...JSON.parse(fixture('search-56-1')),
      searchRow(5701, 'Summary Offences (Artificial Intelligence Generated Material) Amendment', 'LC', '2026-10-29T00:00:00'),
      searchRow(5690, 'Summary Offences (Artificial Intelligence Generated Material) Amendment', 'HA', '2026-10-15T00:00:00'),
    ];
    expect(extractFromSaltSearch(JSON.stringify(rows)).candidates).toEqual([
      {
        url: 'https://salt.parliament.sa.gov.au/bill/5690',
        title: 'Summary Offences (Artificial Intelligence Generated Material) Amendment Bill 2026',
        text: 'Introduced in the House of Assembly by Hon A Member; SALT status: 1st Reading.',
        dateHint: '2026-10-15',
        dateHintPrecision: 'day',
      },
    ]);
  });

  it('refuses a response that is not a list', () => {
    expect(() => extractFromSaltSearch('{"message":"error"}')).toThrow('not a list');
  });
});

describe('parseSaBillSummaries', () => {
  it('reads passage through both Houses, and leaves an assent dated by one House to a reviewer', () => {
    const reading = read('bill-5619-assented');
    expect(reading.title).toBe('Petroleum Products Regulation (Emergencies and Other Matters) Amendment');
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([
      ['2026-05-06', { kind: 'introduced', chamber: 'lower' }],
      ['2026-05-20', { kind: 'passed', chamber: 'lower' }],
      ['2026-06-02', { kind: 'passed', chamber: 'upper' }],
    ]);
    expect(reading.events[0].source).toEqual({ url: saBillPage(5619) });
    expect(reading.unrecognised).toEqual([{ chamber: null, stage: 'Assented as Act No. 1 of 2026, date not confirmed', date: '2026-06-11' }]);
  });

  it('dates assent when every House row is assented on one day with one Act', () => {
    const rows = JSON.parse(fixture('bill-5619-assented'));
    Object.assign(rows[1], { statusText: 'Assented', dateCompleted: '2026-06-11T00:00:00', actNumber: 1 });
    const reading = parseSaBillSummaries(JSON.stringify(rows), { url: saBillPage(5619) });
    expect(reading.events.at(-1)).toMatchObject({ date: '2026-06-11', event: { kind: 'assented', actCitation: 'Act No. 1 of 2026' } });
    expect(reading.unrecognised).toEqual([]);
    expect(legislativePhase(bill(reading.events), 'sa')).toBe('made');
  });

  it('names every Act number the rows give when they disagree', () => {
    const rows = JSON.parse(fixture('bill-5619-assented'));
    Object.assign(rows[1], { statusText: 'Assented', dateCompleted: '2026-06-11T00:00:00', actNumber: 2 });
    expect(parseSaBillSummaries(JSON.stringify(rows), { url: saBillPage(5619) }).unrecognised).toEqual([
      { chamber: null, stage: 'Assented as Act No. 1 of 2026 or Act No. 2 of 2026, date not confirmed', date: '2026-06-11' },
    ]);
  });

  it('reads only the introduction of a bill adjourned at its second reading', () => {
    expect(stages('bill-5620-before-parliament')).toEqual([['2026-05-06', { kind: 'introduced', chamber: 'lower' }]]);
    expect(read('bill-5620-before-parliament').unrecognised).toEqual([]);
  });

  it('reads Council passage with amendments, and not the Assembly receiving the bill', () => {
    expect(stages('bill-5626-passed-amended')).toEqual([
      ['2026-05-07', { kind: 'introduced', chamber: 'upper' }],
      ['2026-08-20', { kind: 'passed', chamber: 'upper', withAmendments: true }],
    ]);
  });

  it('reads a negative vote on its completion date', () => {
    expect(stages('bill-5622-negatived')).toEqual([
      ['2026-05-06', { kind: 'introduced', chamber: 'upper' }],
      ['2026-06-17', { kind: 'negatived', chamber: 'upper' }],
    ]);
  });

  it('shows assent without an Act number, and a status it does not know, to a reviewer', () => {
    const rows = JSON.parse(fixture('bill-5619-assented'));
    rows[0].actNumber = 0;
    rows[1].statusText = 'Laid aside';
    expect(parseSaBillSummaries(JSON.stringify(rows), { url: saBillPage(5619) }).unrecognised).toEqual([
      { chamber: 'upper', stage: 'Laid aside', date: '2026-06-02' },
      { chamber: null, stage: 'Assented', date: '2026-06-11' },
    ]);
  });
});
