// Pure selection helpers behind the /this-week page.
//
// The "week" is anchored to the data's own currency (the collection anchor:
// meta.lastHealthyAt ?? meta.lastCollectedAt, the same value src/app/page.tsx
// uses) rather than the wall clock, so the rendered page is deterministic for
// a given collection state.

import type {
  DatePrecision,
  Development,
  Policy,
  PolicyDateType,
  PolicyStatus,
  PolicyType,
  Jurisdiction,
} from "@/types";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeekWindow {
  /** Inclusive start of the 7-day window, in epoch milliseconds. */
  start: number;
  /** The collection anchor the window is measured back from, in epoch ms. */
  end: number;
}

/**
 * The 7-day window ending at the data's collection anchor, or null when the
 * collection state has no usable anchor.
 */
export function weekWindowEndingAt(
  anchor: string | Date | null | undefined,
): WeekWindow | null {
  if (!anchor) return null;
  const end = new Date(anchor).getTime();
  if (!Number.isFinite(end)) return null;
  return { start: end - WEEK_MS, end };
}

/**
 * A development belongs on the weekly page when it is verified and
 * non-dismissed and was detected inside the data-anchored window.
 */
export function isWeeklyDevelopment(
  development: Development,
  window: WeekWindow,
): boolean {
  if (development.status === "dismissed") return false;
  if (development.verification.status !== "verified") return false;
  const detectedAt = new Date(development.detectedAt).getTime();
  return (
    Number.isFinite(detectedAt) &&
    detectedAt >= window.start &&
    detectedAt <= window.end
  );
}

/**
 * Weekly developments, most relevant first: direct-document change detections
 * (relevanceScore 1) lead, machine-scored items follow; ties break on the
 * most recently detected. Does not mutate the input.
 */
export function selectWeeklyDevelopments(
  developments: readonly Development[],
  window: WeekWindow,
): Development[] {
  return developments
    .filter((development) => isWeeklyDevelopment(development, window))
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
}

/**
 * Human-readable evidence label for a weekly item, following the AGENTS.md
 * confidence rules: machine classifications cap at 0.65 and read as
 * "needs review"; relevanceScore 1 on a tracked record records
 * change-certainty, not classifier confidence; curated entries are editorial.
 */
export function weeklyEvidenceLabel(development: Development): string {
  if (development.classification === "curated") return "Editorial";
  if (development.relevanceScore >= 1) return "Direct source change";
  return "Machine detected (confidence capped at 0.65)";
}

const UPCOMING_DATE_TYPES: readonly PolicyDateType[] = [
  "effective",
  "commenced",
  "consultation_closed",
];

const UPCOMING_POLICY_STATUSES: readonly PolicyStatus[] = ["proposed", "active", "amended"];

export interface UpcomingPolicyDate {
  policyId: string;
  policyTitle: string;
  jurisdiction: Jurisdiction;
  type: PolicyType;
  status: PolicyStatus;
  sourceUrl: string;
  dateType: PolicyDateType;
  date: string;
  precision: DatePrecision;
}

function calendarDay(value: Date | string): string | null {
  if (value instanceof Date && !Number.isFinite(value.getTime())) return null;
  const day = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

/**
 * Upcoming commencement or consultation-closure dates carried in the register
 * records themselves, on or after the reference day in Sydney. The page passes
 * today's window, independently of the historical collection window. A current
 * month/year stays visible with its original precision, never an invented day.
 * Call with public getPolicies() output; this helper cannot resolve withholding.
 */
export function selectUpcomingPolicyDates(
  policies: readonly Policy[],
  window: WeekWindow,
): UpcomingPolicyDate[] {
  const upcoming: UpcomingPolicyDate[] = [];
  const today = new Date(window.end).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const seen = new Set<string>();
  for (const policy of policies) {
    if (policy.verification.status !== 'verified') continue;
    if (!UPCOMING_POLICY_STATUSES.includes(policy.status)) continue;
    for (const policyDate of policy.dates) {
      if (!UPCOMING_DATE_TYPES.includes(policyDate.type)) continue;
      const day = calendarDay(policyDate.date);
      if (!day) continue;
      const length = policyDate.precision === 'year' ? 4 : policyDate.precision === 'month' ? 7 : 10;
      if (day.slice(0, length) < today.slice(0, length)) continue;
      const key = `${policy.id}:${policyDate.type}:${day.slice(0, length)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      upcoming.push({
        policyId: policy.id,
        policyTitle: policy.title,
        jurisdiction: policy.jurisdiction,
        type: policy.type,
        status: policy.status,
        sourceUrl: policy.sourceUrl,
        dateType: policyDate.type,
        date: day,
        precision: policyDate.precision,
      });
    }
  }
  return upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.policyId.localeCompare(b.policyId));
}