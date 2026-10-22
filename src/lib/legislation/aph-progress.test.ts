import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAphProgress, stageUpdate } from './aph-progress';
import { legislativePhase, type Legislative } from './model';

function parse(billId: string) {
  const html = readFileSync(join(__dirname, '__fixtures__/aph', `${billId}.html`), 'utf8');
  return parseAphProgress(html, { url: `https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=${billId}` });
}

function lines(billId: string) {
  return parse(billId).events.map(({ date, event }) => `${date} ${JSON.stringify(event)}`);
}

function phase(billId: string) {
  const legislative: Legislative = {
    kind: 'bill',
    ref: { register: 'aph', billId },
    origin: 'government',
    events: parse(billId).events,
  };
  return legislativePhase(legislative, 'federal');
}

describe('parseAphProgress', () => {
  it('reads a House bill referred to a Senate committee', () => {
    expect(parse('r7553').title).toBe('Online Safety Amendment (Digital Duty of Care) Bill 2026');
    expect(lines('r7553')).toEqual([
      '2026-10-15 {"kind":"introduced","chamber":"lower"}',
      '2026-10-15 {"kind":"referred","committee":"Senate Environment and Communications Legislation Committee","inquiryUrl":"https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Environment_and_Communications/DigitalDutyofCare48P","reportDue":"2026-11-20"}',
    ]);
    expect(phase('r7553')).toBe('before_parliament');
  });

  it('reads a Senate bill that has only been debated', () => {
    expect(lines('s1471')).toEqual(['2025-11-24 {"kind":"introduced","chamber":"upper"}']);
    expect(parse('s1471').unrecognised).toEqual([]);
  });

  it('reads an Act from introduction to assent, with Senate amendments and the committee report', () => {
    expect(lines('r7249')).toEqual([
      '2024-09-12 {"kind":"introduced","chamber":"lower"}',
      '2024-09-19 {"kind":"referred","committee":"Senate Legal and Constitutional Affairs Legislation Committee","inquiryUrl":"https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Legal_and_Constitutional_Affairs/PrivacyAmendment47"}',
      '2024-11-06 {"kind":"passed","chamber":"lower"}',
      '2024-11-14 {"kind":"reported","committee":"Senate Legal and Constitutional Affairs Legislation Committee","reportUrl":"https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Legal_and_Constitutional_Affairs/PrivacyAmendment47"}',
      '2024-11-28 {"kind":"passed","chamber":"upper","withAmendments":true}',
      '2024-12-10 {"kind":"assented","actCitation":"Act No. 128 of 2024"}',
    ]);
    expect(phase('r7249')).toBe('made');
    expect(parse('r7249').unrecognised).toEqual([]);
  });

  it('leaves a stage with no lifecycle meaning for a reviewer instead of guessing', () => {
    const { events, unrecognised } = parse('r7239');
    expect(events.map(({ event }) => event.kind)).toEqual(['introduced', 'referred', 'passed', 'reported']);
    expect(events[2].event).toEqual({ kind: 'passed', chamber: 'lower', withAmendments: true });
    expect(unrecognised).toEqual([{ chamber: 'upper', stage: 'Discharged from Notice Paper', date: '2024-11-25' }]);
  });

  it('cites the bill page as the source of every event', () => {
    for (const { source } of parse('r7537').events) {
      expect(source.url).toMatch(/bId=r7537$/);
    }
  });
});

describe('stageUpdate', () => {
  const bill = (events: Legislative['events']): Extract<Legislative, { kind: 'bill' }> => ({
    kind: 'bill',
    ref: { register: 'aph', billId: 'r7249' },
    origin: 'government',
    events: events as Extract<Legislative, { kind: 'bill' }>['events'],
  });

  it('adds the stages the page shows and the record lacks, and derives the new status', () => {
    const progress = parse('r7249');
    const [introduced, referred] = progress.events;
    const update = stageUpdate(bill([{ ...introduced, source: { url: 'https://www.aph.gov.au/earlier' } }, referred]), 'federal', progress);
    expect(update.kind).toBe('update');
    if (update.kind !== 'update') return;
    expect(update.added.map(({ event }) => event.kind)).toEqual(['passed', 'reported', 'passed', 'assented']);
    expect(update.status).toBe('active');
    expect(update.legislative.events[0].source.url).toBe('https://www.aph.gov.au/earlier');
  });

  it('reports no change when the record has every stage the page shows, plus events from elsewhere', () => {
    const progress = parse('r7249');
    const commenced = { date: '2024-12-11', precision: 'day' as const, event: { kind: 'commenced' as const, extent: 'partial' as const }, source: { url: 'https://www.legislation.gov.au/C2024A00128' } };
    const update = stageUpdate(bill([...progress.events, commenced]), 'federal', progress);
    expect(update).toEqual({ kind: 'unchanged' });
  });

  it('reports a merged history that breaks the legal order instead of applying it', () => {
    const progress = parse('r7553');
    const lapsed = { date: '2026-10-16', precision: 'day' as const, event: { kind: 'lapsed' as const }, source: { url: 'https://www.aph.gov.au/x' } };
    const later = { ...progress, events: [...progress.events, { ...progress.events[0], date: '2026-11-01', event: { kind: 'passed' as const, chamber: 'lower' as const } }] };
    const update = stageUpdate(bill([progress.events[0], lapsed]), 'federal', later);
    expect(update.kind).toBe('invalid');
  });
});
