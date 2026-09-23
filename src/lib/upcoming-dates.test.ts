import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { getUpcomingPolicyDates } from '@/lib/upcoming-dates';

const at = new Date('2026-09-23T00:00:00.000Z');

describe('getUpcomingPolicyDates', () => {
  it('lists future forward-looking dates, soonest first, with days remaining', () => {
    const upcoming = getUpcomingPolicyDates(
      [
        buildPolicy({
          id: 'fwc',
          title: 'FWC guidance note',
          dates: [
            { type: 'published', date: '2026-08-01', precision: 'day' },
            { type: 'effective', date: '2026-10-20', precision: 'day', primary: true },
          ],
        }),
        buildPolicy({
          id: 'consult',
          title: 'AI consultation',
          dates: [{ type: 'consultation_closed', date: '2026-10-01', precision: 'day' }],
        }),
      ],
      at,
    );

    expect(upcoming).toEqual([
      { policyId: 'consult', title: 'AI consultation', type: 'consultation_closed', date: '2026-10-01', precision: 'day', daysUntil: 8 },
      { policyId: 'fwc', title: 'FWC guidance note', type: 'effective', date: '2026-10-20', precision: 'day', daysUntil: 27 },
    ]);
  });

  it('ignores past dates, backward-looking types and dates beyond the horizon', () => {
    const upcoming = getUpcomingPolicyDates(
      [
        buildPolicy({
          id: 'mixed',
          dates: [
            { type: 'effective', date: '2026-09-01', precision: 'day' },
            { type: 'published', date: '2026-10-05', precision: 'day' },
            { type: 'commenced', date: '2027-06-01', precision: 'day' },
          ],
        }),
      ],
      at,
      { horizonDays: 180 },
    );
    expect(upcoming).toEqual([]);
  });

  it('keeps month precision and counts from the start of the month', () => {
    const [upcoming] = getUpcomingPolicyDates(
      [
        buildPolicy({
          id: 'month',
          dates: [{ type: 'commenced', date: '2026-12-01', precision: 'month' }],
        }),
      ],
      at,
    );
    expect(upcoming).toMatchObject({ precision: 'month', daysUntil: 69 });
  });

  it('includes today', () => {
    const upcoming = getUpcomingPolicyDates(
      [buildPolicy({ id: 'today', dates: [{ type: 'effective', date: '2026-09-23', precision: 'day' }] })],
      at,
    );
    expect(upcoming[0]).toMatchObject({ daysUntil: 0 });
  });
});
