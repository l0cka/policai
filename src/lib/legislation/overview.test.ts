import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { Jurisdiction, PolicyDate, PolicyStatus } from '@/types';
import type { Legislative, LegislativeEvent } from './model';
import { beforeParliament, comingUp, legislativeStage, madeLaws, recentlyMade, type LegislativeRecord } from './overview';

const SOURCE = { url: 'https://www.aph.gov.au/bill' };

function on(date: string, event: LegislativeEvent) {
  return { date, precision: 'day' as const, event, source: SOURCE };
}

function bill(...events: ReturnType<typeof on>[]): Legislative {
  return {
    kind: 'bill',
    ref: { register: 'aph', billId: 'r7553' },
    origin: 'government',
    events: events as Extract<Legislative, { kind: 'bill' }>['events'],
  };
}

function instrument(...events: ReturnType<typeof on>[]): Legislative {
  return {
    kind: 'instrument',
    ref: { register: 'frl', titleId: 'F2026L01223' },
    issuerBodyId: 'asic',
    enablingAct: 'Corporations Act 2001',
    events: events as Extract<Legislative, { kind: 'instrument' }>['events'],
  };
}

function record(
  id: string,
  legislative: Legislative,
  { jurisdiction = 'federal', status = 'proposed', dates = [] }: { jurisdiction?: Jurisdiction; status?: PolicyStatus; dates?: PolicyDate[] } = {},
): LegislativeRecord {
  return { ...buildPolicy({ id, title: id, jurisdiction, status, dates }), legislative };
}

const introduced = on('2026-10-15', { kind: 'introduced', chamber: 'lower' });
const passedLower = on('2026-11-26', { kind: 'passed', chamber: 'lower' });
const passedUpper = on('2026-12-03', { kind: 'passed', chamber: 'upper' });
const assented = on('2026-12-10', { kind: 'assented', actCitation: 'Act No. 112 of 2026' });

describe('legislativeStage', () => {
  it.each([
    ['a bill before Parliament', bill(introduced), 'before_parliament'],
    ['an Act not yet in force', bill(introduced, passedLower, passedUpper, assented), 'made'],
    ['a commenced Act', bill(introduced, passedLower, passedUpper, assented, on('2027-01-01', { kind: 'commenced', extent: 'full' })), 'in_force'],
    ['a lapsed bill', bill(introduced, on('2028-04-01', { kind: 'lapsed' })), 'ended'],
  ] as const)('places %s at %s', (_name, legislative, stage) => {
    expect(legislativeStage(record('a', legislative))).toBe(stage);
  });
});

describe('beforeParliament', () => {
  it('lists live bills Commonwealth first, with chambers passed and the latest event', () => {
    const rows = beforeParliament([
      record('sa-bill', bill(introduced), { jurisdiction: 'sa' }),
      record('federal-bill', bill(introduced, passedLower)),
      record('act', bill(introduced, passedLower, passedUpper, assented), { status: 'active' }),
    ]);
    expect(rows.map((row) => [row.record.id, row.chambersPassed, row.chambers, row.last.label])).toEqual([
      ['federal-bill', 1, 2, 'Passed the House of Representatives'],
      ['sa-bill', 0, 2, 'Introduced in the House of Assembly'],
    ]);
  });
});

describe('comingUp', () => {
  it('lists report dates, disallowance ends and scheduled commencements from today', () => {
    const referred = on('2026-10-15', {
      kind: 'referred',
      committee: 'Senate Environment and Communications Legislation Committee',
      inquiryUrl: 'https://www.aph.gov.au/inquiry',
      reportDue: '2026-11-20',
    });
    const registered = on('2026-09-17', { kind: 'registered' });
    const tabled = (chamber: 'lower' | 'upper') =>
      on('2026-10-12', { kind: 'tabled', chamber, disallowanceEnds: '2026-12-01' });
    const commencement: PolicyDate = { type: 'commenced', date: '2028-03-18', precision: 'day' };
    const rows = comingUp(
      [
        record('bill', bill(introduced, referred)),
        record('rules', instrument(registered, tabled('lower'), tabled('upper')), { status: 'active', dates: [commencement] }),
        record('past', bill(introduced, on('2026-10-15', {
          kind: 'referred',
          committee: 'Senate Economics Legislation Committee',
          inquiryUrl: 'https://www.aph.gov.au/inquiry',
          reportDue: '2026-10-01',
        }))),
      ],
      '2026-10-22',
    );
    expect(rows.map((row) => [row.record.id, row.date, row.label])).toEqual([
      ['bill', '2026-11-20', 'Committee report due'],
      ['rules', '2026-12-01', 'Disallowance window ends'],
      ['rules', '2028-03-18', 'Scheduled commencement'],
    ]);
  });
});

describe('recentlyMade', () => {
  it('lists assents, registrations and commencements in the last 90 days', () => {
    const rows = recentlyMade(
      [
        record('act', bill(introduced, passedLower, passedUpper, assented), { status: 'active' }),
        record('rules', instrument(on('2026-08-01', { kind: 'registered' })), { status: 'active' }),
      ],
      '2026-12-20',
    );
    expect(rows.map((row) => [row.record.id, row.date, row.label, row.detail])).toEqual([
      ['act', '2026-12-10', 'Assented', 'Act No. 112 of 2026'],
    ]);
  });
});

describe('madeLaws', () => {
  it('lists every made or in-force law however old, Commonwealth first, and leaves out bills and ended laws', () => {
    const commenced = on('2027-01-01', { kind: 'commenced', extent: 'full' });
    const rows = madeLaws([
      record('sa-act', bill(introduced, passedLower, passedUpper, assented, commenced), { jurisdiction: 'sa', status: 'active' }),
      record('rules', instrument(on('2026-09-17', { kind: 'registered' })), { status: 'active' }),
      record('bill', bill(introduced)),
      record('lapsed', bill(introduced, on('2027-01-01', { kind: 'lapsed' }))),
    ]);
    expect(rows.map((row) => [row.record.id, row.stage, row.last.label])).toEqual([
      ['rules', 'made', 'Registered on the Federal Register of Legislation'],
      ['sa-act', 'in_force', 'Commenced'],
    ]);
  });
});
