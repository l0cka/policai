import { describe, expect, it } from 'vitest';
import {
  formatPolicyDate,
  parseCalendarDateForDisplay,
} from './format-policy-date';

describe('policy calendar dates', () => {
  it('formats date-only values without timezone rollback', () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(
        formatPolicyDate({
          type: 'published',
          date: '2026-06-04',
          precision: 'day',
        }),
      ).toBe('4 June 2026');
      expect(
        formatPolicyDate({
          type: 'published',
          date: '2026-06-01',
          precision: 'month',
        }),
      ).toBe('June 2026');
      expect(
        parseCalendarDateForDisplay('2026-01-01').getFullYear(),
      ).toBe(2026);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
});
