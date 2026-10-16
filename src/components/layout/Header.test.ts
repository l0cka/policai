import { afterEach, describe, expect, it } from 'vitest';
import { formatDataDate } from './Header';

describe('formatDataDate', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('renders Sydney time whatever the process time zone', () => {
    const value = '2026-10-15T20:30:00.000Z';
    const rendered = ['America/New_York', 'Asia/Tokyo', 'UTC'].map((tz) => {
      process.env.TZ = tz;
      return formatDataDate(value);
    });
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toMatch(/^COLLECTION AS AT 16 OCT 2026,? 07:30 /);
  });

  it('falls back when there is no collection date', () => {
    expect(formatDataDate(null)).toBe('SOURCE STATUS IN METHODOLOGY');
  });
});
