import { describe, expect, it } from 'vitest';
import type { Jurisdiction, Policy, PolicyDate, PolicyStatus } from '@/types';
import {
  chambersOf,
  legislativeErrors,
  legislativeStatus,
  type Legislative,
  type LegislativeEvent,
} from './model';

const SOURCE = { url: 'https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7421' };

function on(date: string, event: LegislativeEvent) {
  return { date, precision: 'day' as const, event, source: SOURCE };
}

function bill(...events: ReturnType<typeof on>[]): Legislative {
  return {
    kind: 'bill',
    ref: { register: 'aph', billId: 'r7421' },
    origin: 'government',
    events: events as Extract<Legislative, { kind: 'bill' }>['events'],
  };
}

function instrument(...events: ReturnType<typeof on>[]): Legislative {
  return {
    kind: 'instrument',
    ref: { register: 'frl', titleId: 'F2026L01234' },
    issuerBodyId: 'asic',
    enablingAct: 'Corporations Act 2001',
    events: events as Extract<Legislative, { kind: 'instrument' }>['events'],
  };
}

const introduced = on('2026-10-15', { kind: 'introduced', chamber: 'lower' });
const passedLower = on('2026-11-26', { kind: 'passed', chamber: 'lower', withAmendments: false });
const passedUpper = on('2026-12-03', { kind: 'passed', chamber: 'upper', withAmendments: true });
const assented = on('2026-12-10', { kind: 'assented', actCitation: 'Act No. 112 of 2026' });
const commenced = on('2027-01-01', { kind: 'commenced', extent: 'full' });
const registered = on('2026-09-01', { kind: 'registered' });
const tabledUpper = on('2026-09-08', { kind: 'tabled', chamber: 'upper', disallowanceEnds: '2026-11-20' });

function record(
  legislative: unknown,
  overrides: { status?: PolicyStatus; jurisdiction?: Jurisdiction; type?: Policy['type']; dates?: PolicyDate[] } = {},
) {
  return {
    type: 'legislation' as const,
    status: 'proposed' as const,
    jurisdiction: 'federal' as const,
    dates: [],
    ...overrides,
    legislative,
  };
}

describe('legislativeStatus', () => {
  it.each([
    ['a bill before Parliament', bill(introduced, passedLower), 'proposed'],
    ['an assented Act not yet commenced', bill(introduced, passedLower, passedUpper, assented), 'active'],
    ['a commenced Act', bill(introduced, passedLower, passedUpper, assented, commenced), 'active'],
    ['a lapsed bill', bill(introduced, on('2028-04-01', { kind: 'lapsed' })), 'closed'],
    ['a negatived bill', bill(introduced, on('2026-11-26', { kind: 'negatived', chamber: 'lower' })), 'closed'],
    ['a repealed Act', bill(introduced, passedLower, passedUpper, assented, commenced, on('2029-01-01', { kind: 'repealed', by: 'Repeal Act 2028' })), 'repealed'],
    ['a registered instrument', instrument(registered, tabledUpper), 'active'],
    ['a disallowed instrument', instrument(registered, tabledUpper, on('2026-10-20', { kind: 'disallowed', chamber: 'upper' })), 'closed'],
  ] as const)('derives %s as %s', (_name, legislative, status) => {
    expect(legislativeStatus(legislative, 'federal')).toBe(status);
  });

  it('needs only one chamber in a unicameral Parliament', () => {
    expect(chambersOf('qld')).toEqual(['lower']);
    expect(legislativeStatus(bill(introduced, passedLower, assented), 'qld')).toBe('active');
    expect(legislativeStatus(bill(introduced, passedLower, assented), 'federal')).toBeNull();
  });
});

describe('legislativeErrors', () => {
  it('accepts a record without a legislative field', () => {
    expect(legislativeErrors(record(undefined))).toEqual([]);
  });

  it('accepts a bill whose status and dates agree with its events', () => {
    const legislative = bill(introduced, passedLower, passedUpper, assented, commenced);
    const dates: PolicyDate[] = [{ type: 'commenced', date: '2027-01-01', precision: 'day', primary: true }];
    expect(legislativeErrors(record(legislative, { status: 'active', dates }))).toEqual([]);
  });

  it.each([
    ['assent before the second chamber passes', bill(introduced, passedLower, assented), 'assent needs the bill to pass every chamber'],
    ['a bill that does not start with introduction', bill(passedLower), 'a bill starts with introduced'],
    ['passing the same chamber twice', bill(introduced, passedLower, passedLower), 'already passed the lower chamber'],
    ['a report without a referral', bill(introduced, on('2026-11-01', { kind: 'reported', committee: 'Senate Environment and Communications', reportUrl: 'https://www.aph.gov.au/report' })), 'reported needs an earlier referral'],
    ['an event after a bill lapses', bill(introduced, on('2028-04-01', { kind: 'lapsed' }), on('2028-05-01', { kind: 'lapsed' })), 'nothing follows ended'],
    ['amendment before commencement', bill(introduced, passedLower, passedUpper, assented, on('2027-02-01', { kind: 'amended', by: 'Amendment Act 2027' })), 'only a commenced law is amended'],
    ['events out of date order', bill(passedLower, introduced), 'dated before the event above it'],
    ['disallowance in a chamber it was not tabled in', instrument(registered, tabledUpper, on('2026-10-20', { kind: 'disallowed', chamber: 'lower' })), 'disallowed needs tabling in the lower chamber'],
    ['a bill event on an instrument', instrument(registered, introduced), 'only a bill is introduced'],
  ])('rejects %s', (_name, legislative, message) => {
    const errors = legislativeErrors(record(legislative));
    expect(errors.join('\n')).toContain(message);
  });

  it('rejects an upper chamber in a unicameral Parliament', () => {
    const legislative = bill(introduced, on('2026-11-26', { kind: 'passed', chamber: 'upper', withAmendments: false }));
    expect(legislativeErrors(record(legislative, { jurisdiction: 'act' })).join('\n')).toContain('act has no upper chamber');
  });

  it('rejects a stored status that disagrees with the events', () => {
    expect(legislativeErrors(record(bill(introduced), { status: 'active' }))).toEqual([
      'status "active" disagrees with its lifecycle events, which make it "proposed"',
    ]);
  });

  it('allows a trashed record and a superseded Act', () => {
    expect(legislativeErrors(record(bill(introduced), { status: 'trashed' }))).toEqual([]);
    expect(legislativeErrors(record(instrument(registered), { status: 'superseded' }))).toEqual([]);
  });

  it('requires a record date for each commencement, amendment and repeal', () => {
    const legislative = bill(introduced, passedLower, passedUpper, assented, commenced);
    expect(legislativeErrors(record(legislative, { status: 'active' }))).toEqual([
      'legislative.events[4] commenced on 2027-01-01 has no matching "commenced" record date',
    ]);
  });

  it('keeps legislative to legislation and regulation records', () => {
    expect(legislativeErrors(record(bill(introduced), { type: 'guideline' }))).toEqual([
      'legislative is only for legislation or regulation records, not "guideline"',
    ]);
  });

  it.each([
    ['an unknown register', { ...bill(introduced), ref: { register: 'hansard' } }, 'ref.register "hansard" is not aph, frl or state'],
    ['a malformed APH bill id', { ...bill(introduced), ref: { register: 'aph', billId: 'bill-1' } }, 'ref.billId "bill-1" is not an APH bill id'],
    ['a state ref for the Commonwealth', { ...bill(introduced), ref: { register: 'state', jurisdiction: 'federal', url: 'https://example.gov.au' } }, 'is not a state or territory'],
    ['an unknown event', bill(on('2026-10-15', { kind: 'proclaimed' } as unknown as LegislativeEvent)), 'event.kind "proclaimed" is not a lifecycle event'],
    ['an event without a source', { ...bill(introduced), events: [{ ...introduced, source: { url: 'http://insecure' } }] }, 'source.url must be an https URL'],
    ['an invalid calendar date', bill(on('2026-02-30', { kind: 'introduced', chamber: 'lower' })), 'date "2026-02-30" must be YYYY-MM-DD'],
    ['an instrument without its enabling Act', { ...instrument(registered), enablingAct: '' }, 'enablingAct is required'],
  ])('rejects %s', (_name, legislative, message) => {
    expect(legislativeErrors(record(legislative)).join('\n')).toContain(message);
  });
});
