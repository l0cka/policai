import type { DatePrecision, Policy, PolicyDateType } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Date types that describe something about to happen: a rule taking effect
 * or a consultation closing. Publication and amendment dates look backward.
 */
const FORWARD_DATE_TYPES: ReadonlySet<PolicyDateType> = new Set([
  'effective',
  'commenced',
  'consultation_closed',
  'repealed',
  'superseded',
]);

export interface UpcomingPolicyDate {
  policyId: string;
  title: string;
  type: PolicyDateType;
  date: string;
  precision: DatePrecision;
  daysUntil: number;
}

function calendarDay(value: Date | string): number {
  const iso = value instanceof Date ? value.toISOString() : value;
  return Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Forward-looking dates already recorded on register records, soonest first.
 * These are the structured `dates` an editor verified; nothing is inferred
 * from prose. `at` is passed in so a page renders deterministically for a
 * given data state.
 */
export function getUpcomingPolicyDates(
  policies: readonly Pick<Policy, 'id' | 'title' | 'dates'>[],
  at: Date,
  options: { horizonDays?: number } = {},
): UpcomingPolicyDate[] {
  const horizonDays = options.horizonDays ?? 180;
  const today = calendarDay(at);
  const upcoming: UpcomingPolicyDate[] = [];
  for (const policy of policies) {
    for (const date of policy.dates) {
      if (!FORWARD_DATE_TYPES.has(date.type)) continue;
      const day = calendarDay(date.date);
      if (Number.isNaN(day)) continue;
      const daysUntil = Math.round((day - today) / DAY_MS);
      if (daysUntil < 0 || daysUntil > horizonDays) continue;
      upcoming.push({
        policyId: policy.id,
        title: policy.title,
        type: date.type,
        date: new Date(day).toISOString().slice(0, 10),
        precision: date.precision,
        daysUntil,
      });
    }
  }
  return upcoming.sort(
    (a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title),
  );
}
