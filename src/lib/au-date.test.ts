import { describe, expect, it } from 'vitest';
import { auDate, sydneyShortDate } from './au-date';

describe('sydneyShortDate', () => {
  it.each([
    ['2026-09-05T02:00:00Z', '5 Sep 2026'],
    ['2026-09-30T13:59:59Z', '30 Sep 2026'],
    ['2026-09-30T14:00:00Z', '1 Oct 2026'],
    ['2026-08-31T14:00:00Z', '1 Sep 2026'],
    ['2026-01-01T12:59:59Z', '1 Jan 2026'],
    ['2026-01-01T13:00:00.000Z', '2 Jan 2026'],
    ['2026-05-17', '17 May 2026'],
  ])('renders %s as %s', (stamp, text) => {
    expect(sydneyShortDate(stamp)).toBe(text);
  });

  it('rejects a stamp that is not a date', () => {
    expect(() => sydneyShortDate('not a date')).toThrow(RangeError);
  });
});

describe('auDate', () => {
  it('abbreviates September to three letters like every other month', () => {
    expect(
      auDate(new Date('2026-09-05T00:00:00Z'), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    ).toBe('5 Sep 2026');
  });

  it('leaves the long month name alone', () => {
    expect(auDate(new Date('2026-09-05T00:00:00Z'), { month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe(
      'September 2026',
    );
  });
});
