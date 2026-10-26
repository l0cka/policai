import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frlAmendedPrincipals, frlCommencements, frlTitleRecord, frlVersionsFrom, parseFrlPrincipals, parseFrlTitle } from './frl-title';
import { legislativePhase, type Dated, type Legislative, type LegislativeEvent } from './model';
import { stageUpdate } from './stage-update';

const fixture = (titleId: string) => readFileSync(join(__dirname, '__fixtures__/frl', `${titleId}.json`), 'utf8');

/** The ASIC rules record with its disallowance windows fixed by the register. */
function withWindows(json: string, hor: string, senate: string): string {
  const title = JSON.parse(json);
  title.parliamentaryScrutinySummary = { ...title.parliamentaryScrutinySummary, lastDateForDisallowanceInHoR: hor, lastDateForDisallowanceInSenate: senate };
  return JSON.stringify(title);
}

function instrument(events: Dated<LegislativeEvent>[]): Legislative {
  return {
    kind: 'instrument',
    ref: { register: 'frl', titleId: 'F2026L01223' },
    issuerBodyId: 'asic',
    enablingAct: 'Corporations Act 2001, s 798G(1)',
    events: events as Extract<Legislative, { kind: 'instrument' }>['events'],
  };
}

describe('frlTitleRecord', () => {
  it('asks the register API for the title with its tabling record', () => {
    expect(frlTitleRecord('F2026L01223')).toBe(
      "https://api.prod.legislation.gov.au/v1/Titles('F2026L01223')?$expand=parliamentaryScrutiny,parliamentaryScrutinySummary",
    );
  });
});

describe('parseFrlTitle', () => {
  it('reads registration and tabling in each House, citing the register page', () => {
    const reading = parseFrlTitle(fixture('F2026L01223'));
    expect(reading.title).toBe('ASIC Market Integrity Rules (Securities Markets) Amendment Instrument 2026/574');
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([
      ['2026-09-17', { kind: 'registered' }],
      ['2026-10-12', { kind: 'tabled', chamber: 'lower' }],
      ['2026-10-12', { kind: 'tabled', chamber: 'upper' }],
    ]);
    expect(reading.unrecognised).toEqual([]);
    expect(reading.events[0].source).toEqual({
      url: 'https://www.legislation.gov.au/F2026L01223/asmade/details',
      title: 'ASIC Market Integrity Rules (Securities Markets) Amendment Instrument 2026/574',
    });
    expect(legislativePhase(instrument(reading.events), 'federal')).toBe('made');
  });

  it('treats the register placeholder date 9999-12-31 as not yet fixed, and reads a fixed window end', () => {
    const reading = parseFrlTitle(withWindows(fixture('F2026L01223'), '2026-12-03T00:00:00', '9999-12-31T23:59:59.9999999'));
    expect(reading.events.slice(1).map(({ event }) => event)).toEqual([
      { kind: 'tabled', chamber: 'lower', disallowanceEnds: '2026-12-03' },
      { kind: 'tabled', chamber: 'upper' },
    ]);
  });

  it('reads an agreed disallowance motion as disallowance, not as a later repeal', () => {
    const reading = parseFrlTitle(fixture('F2024L00850'));
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([
      ['2024-07-01', { kind: 'registered' }],
      ['2024-07-03', { kind: 'tabled', chamber: 'lower' }],
      ['2024-07-04', { kind: 'tabled', chamber: 'upper' }],
      ['2024-11-20', { kind: 'disallowed', chamber: 'upper' }],
    ]);
    expect(legislativePhase(instrument(reading.events), 'federal')).toBe('ended');
  });

  it('shows a disallowance motion that did not pass to a reviewer', () => {
    const title = JSON.parse(fixture('F2024L00850'));
    title.parliamentaryScrutiny[3].motionOutcomeType = 'DebatedAndNegatived';
    title.statusHistory = title.statusHistory.slice(0, 1);
    const reading = parseFrlTitle(JSON.stringify(title));
    expect(reading.events.map(({ event }) => event.kind)).toEqual(['registered', 'tabled', 'tabled']);
    expect(reading.unrecognised).toEqual([
      { chamber: 'upper', stage: 'Notice of a disallowance motion by Senator Cadell, negatived', date: '2024-09-16' },
    ]);
  });

  it('keeps a genuine repeal after a disallowance visible, so the reviewer sees the conflict', () => {
    const title = JSON.parse(fixture('F2024L00850'));
    title.statusHistory[1].reasons[0].affectedByTitle = { titleId: 'F2024L09999', name: 'Repealing Rules 2024', provisions: 'sch 1' };
    const reading = parseFrlTitle(JSON.stringify(title));
    expect(reading.events.at(-1)).toMatchObject({ event: { kind: 'repealed', by: 'sch 1 of the Repealing Rules 2024' } });
  });

  it('reads a dated repeal with the provision that repealed it', () => {
    const reading = parseFrlTitle(fixture('F2024L01303'));
    expect(reading.events.at(-1)).toMatchObject({ date: '2025-03-26', event: { kind: 'repealed', by: 's 48A of the Legislation Act 2003' } });
    expect(legislativePhase(instrument(reading.events), 'federal')).toBe('repealed');
  });

  it('does not read a principal as commenced on its first in-force day, which is its registration day', () => {
    const reading = parseFrlTitle(fixture('F2024L00710'));
    expect(reading.principal).toBe(true);
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([['2024-06-21', { kind: 'registered' }]]);
    expect(legislativePhase(instrument(reading.events), 'federal')).toBe('made');
  });

  it('ignores a principal instrument\'s future repeal', () => {
    expect(parseFrlTitle(fixture('F2026L01239')).events.map(({ event }) => event.kind)).toEqual(['registered']);
  });

  it('refuses a response that is not a title record', () => {
    expect(() => parseFrlTitle('{"value":[]}')).toThrow('not a title record');
  });
});

describe('stageUpdate on an instrument', () => {
  it('replaces a tabling whose disallowance window the register has since fixed', () => {
    const recorded = parseFrlTitle(fixture('F2026L01223')).events;
    const update = stageUpdate(instrument(recorded), 'federal', parseFrlTitle(withWindows(fixture('F2026L01223'), '2026-12-03T00:00:00', '2026-12-04T00:00:00')));
    expect(update.kind).toBe('update');
    if (update.kind !== 'update') return;
    expect(update.added).toEqual([]);
    expect(update.changed.map(({ event }) => event)).toEqual([
      { kind: 'tabled', chamber: 'lower', disallowanceEnds: '2026-12-03' },
      { kind: 'tabled', chamber: 'upper', disallowanceEnds: '2026-12-04' },
    ]);
    expect(update.legislative.events).toHaveLength(3);
    expect(update.status).toBe('active');
  });

  it('reports no change when the register still shows what the record holds', () => {
    const reading = parseFrlTitle(fixture('F2026L01223'));
    expect(stageUpdate(instrument(reading.events), 'federal', reading)).toEqual({ kind: 'unchanged' });
  });
});

describe('an amending instrument commencing in its principal', () => {
  it('builds the search and versions queries the register accepts', () => {
    expect(frlAmendedPrincipals('F2026L01223')).toBe(
      "https://api.prod.legislation.gov.au/v1/Titles/Search(criteria='affects(%22F2026L01223%22,%5Bamending%5D)')?$select=id,name,isPrincipal",
    );
    expect(frlVersionsFrom('F2017L01474', '2026-09-17')).toBe(
      'https://api.prod.legislation.gov.au/v1/Versions?$filter=titleId%20eq%20\'F2017L01474\'%20and%20start%20ge%202026-09-17T00%3A00%3A00&$select=titleId,start,reasons',
    );
  });

  it('finds the principal and the day the amendments commence in it', () => {
    expect(parseFrlTitle(fixture('F2026L01223')).principal).toBe(false);
    expect(parseFrlPrincipals(fixture('search-affects-F2026L01223-amending'))).toEqual(['F2017L01474']);
    expect(frlCommencements(fixture('F2017L01474.versions'), 'F2026L01223')).toEqual([
      { date: '2028-03-17', principalId: 'F2017L01474', provisions: 'sch 1 (items 1-109)' },
    ]);
    expect(frlCommencements(fixture('F2017L01474.versions'), 'F2099L00001')).toEqual([]);
  });
});
