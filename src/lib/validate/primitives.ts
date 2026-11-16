import { isValidCalendarDate } from '@/lib/calendar-date';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
export const SHA256 = /^[a-f0-9]{64}$/;

export function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCalendarDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_DATE.test(value) &&
    isValidCalendarDate(value)
  );
}

export function isTimestampString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    RFC3339_TIMESTAMP.test(value) &&
    isValidCalendarDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
