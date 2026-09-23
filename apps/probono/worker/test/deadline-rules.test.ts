import { describe, expect, it } from 'vitest';
import {
  effectiveKind,
  effectivePrecision,
  primaryAction,
  quoteHasDay,
  selectDigestDeadlines,
  vetDeadlines,
} from '../src/lib/deadline-rules.js';
import { prepareEnrichment } from '../src/lib/types.js';

// Enrichment time for the audit fixtures: before every audited date.
const AUG_20 = new Date('2026-08-20T02:00:00Z');

const dl = (over: Record<string, unknown>) => ({
  date: '2026-10-16',
  label: 'Submissions close',
  kind: 'action',
  precision: 'day',
  primary: true,
  quote: 'Submissions close 5pm Friday 16 October 2026.',
  target_url: null,
  ...over,
});

describe('quoteHasDay', () => {
  it.each([
    'Submissions close 16 October 2026',
    'by 5pm Friday 16 October',
    'closing on the 16th of October',
    'until Friday, 16 Oct. 2026',
    'Closes October 16, 2026',
    'due 16/10/2026',
    'due 16.10.26',
    'deadline: 2026-10-16',
  ])('accepts %s', (quote) => expect(quoteHasDay(quote, '2026-10-16')).toBe(true));

  it.each([
    'Submissions close in October 2026',
    'Once it is generally available in 2027',
    'suspend further participation for a period of six months',
    'Submissions close 6 October 2026',
    'due 10/16/2026 (US format is not read as a day-first date)',
  ])('rejects %s', (quote) => expect(quoteHasDay(quote, '2026-10-16')).toBe(false));
});

describe('vetDeadlines: the 15 audited wrong rows, as the model would now emit them', () => {
  it('61587: two dates both claimed primary -> both kept, neither primary', () => {
    const r = vetDeadlines(
      [
        dl({ date: '2026-10-02', label: 'Feedback submissions (alternative formats)', quote: 'call us by 5pm Friday 2 October 2026 to discuss other feedback options' }),
        dl({ date: '2026-10-16', label: 'Email submissions on consumer strategy', quote: 'Email your submission by Friday 16 October 2026' }),
      ],
      AUG_20,
    );
    expect(r.kept).toHaveLength(2);
    expect(r.kept.every((d) => !d.primary)).toBe(true);
    expect(r.notes.join()).toMatch(/at most one/);
  });

  it('61587: the corrected output keeps the 16 Oct close as the only primary', () => {
    const r = vetDeadlines(
      [
        dl({ date: '2026-10-02', label: 'Ask for an alternative feedback format', primary: false, quote: 'call us by 5pm Friday 2 October 2026 to discuss other feedback options' }),
        dl({ date: '2026-10-16', label: 'Submissions close', quote: 'Email your submission by Friday 16 October 2026' }),
      ],
      AUG_20,
    );
    expect(r.kept.filter((d) => d.primary).map((d) => d.date)).toEqual(['2026-10-16']);
  });

  it('12963 / 4307: "in 2027" stored as a day is dropped; as a year it is kept', () => {
    const asDay = vetDeadlines([dl({ date: '2027-01-01', label: 'claiR general availability', kind: 'milestone', primary: false, quote: 'Once it is generally available in 2027' })], AUG_20);
    expect(asDay.kept).toEqual([]);
    expect(asDay.dropped[0].reason).toMatch(/day precision/);
    const court = vetDeadlines([dl({ date: '2027-01-01', label: 'Specialist Family Violence Court opening', kind: 'milestone', primary: false, quote: 'the introduction of the Specialist Family Violence Court in 2027' })], AUG_20);
    expect(court.kept).toEqual([]);
    const asYear = vetDeadlines([dl({ date: '2027-06-15', label: 'claiR general availability', kind: 'milestone', precision: 'year', primary: false, quote: 'Once it is generally available in 2027' })], AUG_20);
    expect(asYear.kept).toMatchObject([{ date: '2027-01-01', precision: 'year' }]);
  });

  it('54198: a date computed from "six months" has no day in the quote and is dropped', () => {
    const r = vetDeadlines([dl({ date: '2027-03-03', label: 'NT Justice Policy Partnership six-month suspension period ends', kind: 'milestone', primary: false, quote: 'suspend further participation for a period of six months' })], AUG_20);
    expect(r.kept).toEqual([]);
  });

  it('733: "due in September 2026" rounded to 30 Sep is dropped; month precision survives', () => {
    const day = vetDeadlines([dl({ date: '2026-09-30', label: 'Final report due', kind: 'milestone', primary: false, quote: 'final report due in September 2026' })], AUG_20);
    expect(day.kept).toEqual([]);
    const month = vetDeadlines([dl({ date: '2026-09-30', label: 'Final report due', kind: 'milestone', precision: 'month', primary: false, quote: 'final report due in September 2026' })], AUG_20);
    expect(month.kept).toMatchObject([{ date: '2026-09-01', precision: 'month' }]);
  });

  it('21416: an election date from outside knowledge is dropped', () => {
    const r = vetDeadlines([dl({ date: '2026-11-28', label: 'Victorian state election', kind: 'milestone', primary: false, quote: 'ahead of the 2026 state election' })], AUG_20);
    expect(r.kept).toEqual([]);
  });

  it('41366: "Applications open" is forced to a non-primary milestone', () => {
    const r = vetDeadlines([dl({ date: '2026-09-21', label: 'Applications open', quote: 'Applications open on Monday 21 September 2026' })], AUG_20);
    expect(r.kept).toMatchObject([{ kind: 'milestone', primary: false }]);
  });

  it('25891 / 37286: meetings and webinars are milestones', () => {
    const r = vetDeadlines(
      [
        dl({ date: '2026-09-06', label: 'Special General Meeting to appoint auditor', quote: 'When: 5.30pm Friday 6 September 2026' }),
        dl({ date: '2026-09-03', label: 'Register for webinar on national environmental standards', primary: false, quote: 'Join our webinar on Thursday 3 September' }),
      ],
      AUG_20,
    );
    expect(r.kept.map((d) => d.kind)).toEqual(['milestone', 'milestone']);
    expect(r.kept.some((d) => d.primary)).toBe(false);
  });

  it('keeps an opening notice that also states the close as an action', () => {
    const r = vetDeadlines([dl({ date: '2026-10-02', label: 'Consultation closes', quote: 'Consultation opens today and closes on 2 October 2026' })], AUG_20);
    expect(r.kept).toMatchObject([{ kind: 'action', primary: true }]);
  });

  it('drops dates already past at enrichment, and month dates only once the month ends', () => {
    const now = new Date('2026-09-23T02:00:00Z');
    const r = vetDeadlines(
      [
        dl({ date: '2026-09-18', quote: 'until Friday 18 September 2026' }),
        dl({ date: '2026-09-01', precision: 'month', kind: 'milestone', primary: false, quote: 'report due in September 2026' }),
      ],
      now,
    );
    expect(r.dropped.map((d) => d.reason)).toEqual([expect.stringMatching(/already passed/)]);
    expect(r.kept).toMatchObject([{ precision: 'month' }]);
  });

  it('drops impossible dates, missing quotes and over-long quotes without failing the rest', () => {
    const r = vetDeadlines(
      [
        dl({ date: '2026-02-30', quote: 'closes 30 February' }),
        dl({ quote: undefined }),
        dl({ quote: 'x'.repeat(301) }),
        { date: '2026-10-16', label: 'Legacy shape without new fields' },
        dl({}),
      ],
      AUG_20,
    );
    expect(r.dropped).toHaveLength(4);
    expect(r.kept).toHaveLength(1);
  });

  it('clears a primary flag on a milestone and nulls a non-http target_url', () => {
    const r = vetDeadlines([dl({ kind: 'milestone', label: 'Report handed down', quote: 'report due 16 October 2026', target_url: 'javascript:alert(1)' })], AUG_20);
    expect(r.kept).toMatchObject([{ primary: false, target_url: null }]);
  });
});

describe('prepareEnrichment', () => {
  const base = {
    stream: 'law_reform',
    relevant: true,
    blurb: 'The regulator seeks feedback on its consumer strategy until mid-October.',
    opportunity: true,
    opportunity_reason: 'Submissions close 16 October 2026.',
    excerpt: null,
  };

  it('keeps the item when one deadline is invalid', () => {
    const r = prepareEnrichment(
      { ...base, entities: { organisations: [], amounts: [], deadlines: [dl({}), dl({ date: '2027-03-03', quote: 'for six months' })] } },
      AUG_20,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.enrichment.entities.deadlines).toHaveLength(1);
    expect(r.dropped).toHaveLength(1);
  });

  it('still rejects an invalid item', () => {
    expect(prepareEnrichment({ ...base, stream: 'sport', entities: { organisations: [], deadlines: [], amounts: [] } }).ok).toBe(false);
  });
});

describe('legacy rows (no precision / primary / quote)', () => {
  it('reads 1 January as year precision and other dates as day precision', () => {
    expect(effectivePrecision({ date: '2027-01-01' })).toBe('year');
    expect(effectivePrecision({ date: '2026-10-16' })).toBe('day');
    expect(effectivePrecision({ date: '2027-01-01', precision: 'day' })).toBe('day');
  });

  it('overrides an explicit action kind for openings and meetings, and requires a close word otherwise', () => {
    expect(effectiveKind({ label: 'Applications open', kind: 'action' })).toBe('milestone');
    expect(effectiveKind({ label: 'Special General Meeting to appoint auditor', kind: 'action' })).toBe('milestone');
    expect(effectiveKind({ label: 'Launch of the new portal' })).toBe('milestone');
    expect(effectiveKind({ label: 'Submissions close' })).toBe('action');
    expect(effectiveKind({ label: 'UN report due', kind: 'milestone' })).toBe('milestone');
  });

  it('takes the latest day-precision action as the primary of a legacy item (61587)', () => {
    const p = primaryAction([
      { date: '2026-10-02', label: 'Feedback submissions (alternative formats)', kind: 'action' },
      { date: '2026-10-16', label: 'Email submissions on consumer strategy', kind: 'action' },
    ]);
    expect(p?.date).toBe('2026-10-16');
  });
});

describe('selectDigestDeadlines', () => {
  it('lists one primary date per item, skips milestones and duplicates', () => {
    const out = selectDigestDeadlines(
      [
        { title: 'Consumer strategy', entities: { deadlines: [
          { date: '2026-10-02', label: 'Alternative formats', kind: 'action' },
          { date: '2026-10-16', label: 'Submissions close', kind: 'action' },
        ] } },
        { title: 'Internship', entities: { deadlines: [{ date: '2026-09-28', label: 'Applications open', kind: 'action' }] } },
        { title: 'claiR', entities: { deadlines: [{ date: '2027-01-01', label: 'claiR general availability due', kind: 'action' }] } },
        { title: 'Modern slavery (AGD)', entities: { deadlines: [{ date: '2026-09-25', label: 'Submissions close', kind: 'action', primary: true, precision: 'day', quote: 'by 25 September 2026' }] } },
        { title: 'Modern slavery (law firm)', entities: { deadlines: [{ date: '2026-09-25', label: 'Submissions close', kind: 'action' }] } },
        { title: 'Old', entities: { deadlines: [{ date: '2026-09-01', label: 'Submissions close', kind: 'action' }] } },
        { title: 'No entities', entities: null },
      ],
      '2026-09-23',
    );
    expect(out).toEqual([
      { date: '2026-09-25', label: 'Submissions close', itemTitle: 'Modern slavery (AGD)' },
      { date: '2026-10-16', label: 'Submissions close', itemTitle: 'Consumer strategy' },
    ]);
  });
});
