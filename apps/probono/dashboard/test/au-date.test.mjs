import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auDate, sydneyCalendarDate, sydneyShortDate } from '../lib/au-date.ts';

const SHORT_DATES = [
  ['2026-09-05T02:00:00Z', '5 Sep 2026'],
  ['2026-09-30T13:59:59Z', '30 Sep 2026'],
  ['2026-09-30T14:00:00Z', '1 Oct 2026'],
  ['2026-08-31T14:00:00Z', '1 Sep 2026'],
  ['2026-01-01T12:59:59Z', '1 Jan 2026'],
  ['2026-01-01T13:00:00.000Z', '2 Jan 2026'],
  ['2026-05-17T00:00:00Z', '17 May 2026'],
];

const CALENDAR_DATES = [
  ['2026-09-22T21:30:00Z', '2026-09-23'],
  ['2026-09-30T13:59:59Z', '2026-09-30'],
  ['2026-09-30T14:00:00Z', '2026-10-01'],
  ['2026-01-01T12:59:59Z', '2026-01-01'],
  ['2026-01-01T13:00:00Z', '2026-01-02'],
  ['2026-12-31T13:00:00Z', '2027-01-01'],
];

describe('sydneyShortDate', () => {
  for (const [stamp, text] of SHORT_DATES) {
    it(`renders ${stamp} as ${text}`, () => {
      assert.equal(sydneyShortDate(stamp), text);
      assert.equal(sydneyShortDate(new Date(stamp)), text);
    });
  }

  it('rejects a stamp that is not a date', () => {
    assert.throws(() => sydneyShortDate('not a date'), RangeError);
  });
});

describe('sydneyCalendarDate', () => {
  for (const [stamp, date] of CALENDAR_DATES) {
    it(`gives ${date} for ${stamp}`, () => {
      assert.equal(sydneyCalendarDate(new Date(stamp)), date);
    });
  }

  it('returns Invalid Date without throwing for an unparseable stamp', () => {
    assert.equal(sydneyCalendarDate(new Date('not a date')), 'Invalid Date');
  });
});

describe('auDate', () => {
  it('abbreviates September to three letters like every other month', () => {
    assert.equal(
      auDate(new Date('2026-09-05T00:00:00Z'), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
      '5 Sep 2026',
    );
  });

  it('leaves the long month name alone', () => {
    assert.equal(auDate(new Date('2026-09-05T00:00:00Z'), { month: 'long', year: 'numeric', timeZone: 'UTC' }), 'September 2026');
  });
});
