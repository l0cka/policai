import { describe, expect, it } from 'vitest';
import type { Jurisdiction, PolicyDate } from '@/types';
import type { Legislative, LegislativeEvent } from './model';
import { progressSteps } from './progress';

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

function steps(legislative: Legislative, jurisdiction: Jurisdiction = 'federal', dates: PolicyDate[] = []) {
  return progressSteps({ legislative, jurisdiction, dates }).map((step) =>
    step.state === 'done'
      ? `done: ${step.label}${step.detail ? ` (${step.detail})` : ''} ${step.date}`
      : `next: ${step.label}${step.date ? ` ${step.date}` : ''}`,
  );
}

describe('progressSteps', () => {
  it('lists what a bill before Parliament has done and what is still ahead', () => {
    expect(
      steps(
        bill(
          on('2026-10-15', { kind: 'introduced', chamber: 'lower' }),
          on('2026-10-15', {
            kind: 'referred',
            committee: 'Senate Environment and Communications Legislation Committee',
            inquiryUrl: 'https://www.aph.gov.au/inquiry',
            reportDue: '2026-11-20',
          }),
        ),
      ),
    ).toEqual([
      'done: Introduced in the House of Representatives 2026-10-15',
      'done: Referred to the Senate Environment and Communications Legislation Committee (Report due 20 November 2026) 2026-10-15',
      'next: Passes the House of Representatives',
      'next: Passes the Senate',
      'next: Assent',
      'next: Commencement',
    ]);
  });

  it('names state chambers and needs one pass in a unicameral Parliament', () => {
    expect(steps(bill(on('2026-03-01', { kind: 'introduced', chamber: 'upper' })), 'sa')).toEqual([
      'done: Introduced in the Legislative Council 2026-03-01',
      'next: Passes the Legislative Council',
      'next: Passes the House of Assembly',
      'next: Assent',
      'next: Commencement',
    ]);
    expect(steps(bill(on('2026-03-01', { kind: 'introduced', chamber: 'lower' })), 'qld')).toEqual([
      'done: Introduced in the Legislative Assembly 2026-03-01',
      'next: Passes the Legislative Assembly',
      'next: Assent',
      'next: Commencement',
    ]);
  });

  it('shows a scheduled commencement for an Act not yet in force', () => {
    const legislative = bill(
      on('2026-10-15', { kind: 'introduced', chamber: 'lower' }),
      on('2026-11-01', { kind: 'passed', chamber: 'lower' }),
      on('2026-11-20', { kind: 'passed', chamber: 'upper', withAmendments: true }),
      on('2026-12-01', { kind: 'assented', actCitation: 'Act No. 112 of 2026' }),
    );
    const dates: PolicyDate[] = [{ type: 'commenced', date: '2027-06-01', precision: 'day' }];
    expect(steps(legislative, 'federal', dates).slice(-3)).toEqual([
      'done: Passed the Senate (With amendments) 2026-11-20',
      'done: Assented (Act No. 112 of 2026) 2026-12-01',
      'next: Commencement 2027-06-01',
    ]);
  });

  it('shows nothing ahead once a bill has lapsed or an Act has commenced', () => {
    expect(
      steps(bill(on('2026-10-15', { kind: 'introduced', chamber: 'lower' }), on('2028-04-01', { kind: 'lapsed' }))),
    ).toEqual(['done: Introduced in the House of Representatives 2026-10-15', 'done: Lapsed 2028-04-01']);
  });
});
