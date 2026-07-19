import type { PolicyDate } from '@/types';

export function parseCalendarDateForDisplay(value: Date | string): Date {
  if (value instanceof Date) return value;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(value);
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

export function formatPolicyDate(
  policyDate: PolicyDate,
  options: { short?: boolean } = {},
): string {
  const date =
    policyDate.date instanceof Date
      ? policyDate.date
      : new Date(`${policyDate.date.slice(0, 10)}T00:00:00.000Z`);
  if (policyDate.precision === 'year') {
    return date.toLocaleDateString('en-AU', {
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  if (policyDate.precision === 'month') {
    return date.toLocaleDateString('en-AU', {
      month: options.short ? 'short' : 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
