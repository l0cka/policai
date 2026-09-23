import { getPool } from './db';
import { withCleanTitles } from './display-title';
import { buildDeadlineView, type DeadlineCard, type DeadlineItem, type DeadlineView } from './deadline-model';

export type { DeadlineCard, DeadlineView } from './deadline-model';

/*
 * Kind as SQL, for the feed's open-opportunity filter. Mirrors effectiveKind in
 * deadline-model.ts: openings, launches, meetings and events are milestones
 * unless a close verb appears; an explicit kind wins otherwise; rows written
 * before `kind` existed fall back to the label. ("Applications open" used to
 * match a bare 'appl' and read as an action.) Postgres regexes use \y for a
 * word boundary.
 */
const NON_DEADLINE_SQL =
  `'\\y(open(s|ed|ing)?|launch(es|ed|ing)?|meeting|webinar|event|forum|conference|symposium|summit|info(rmation)? session|workshop|hearing|agm|general meeting)\\y'`;
const CLOSE_VERB_SQL =
  `'\\y(close[sd]?|closing|due|deadline|lodge[sd]?|lodg(e|ing|ement)|apply by|register by|until|no later than|before [0-9]|by ([0-9]|5 ?pm|midnight|cob|close|mon|tue|wed|thu|fri|sat|sun))'`;
const ACTION_LABEL_SQL =
  `'\\y(close[sd]?|closing|due|deadline|submi|lodg|apply|register by|registrations? close|nominat|expressions? of interest|eoi|tender)'`;
const KIND_SQL = `
  CASE
    WHEN (coalesce(d->>'label', '') || ' ' || coalesce(d->>'quote', '')) ~* ${NON_DEADLINE_SQL}
     AND NOT (coalesce(d->>'label', '') || ' ' || coalesce(d->>'quote', '')) ~* ${CLOSE_VERB_SQL}
      THEN 'milestone'
    WHEN d->>'kind' IN ('action', 'milestone') THEN d->>'kind'
    WHEN (d->>'label') ~* ${ACTION_LABEL_SQL} THEN 'action'
    ELSE 'milestone'
  END`;

/* Last day a date can mean, as effectiveEnd/effectivePrecision do: a month
 * date runs to its end, a year date (or a legacy bare 1 January) to 31 Dec.
 * "-31" is a safe upper bound for string comparison in any month. */
const END_SQL = `
  CASE
    WHEN d->>'precision' = 'year' OR (d->>'precision' IS NULL AND d->>'date' LIKE '%-01-01')
      THEN left(d->>'date', 4) || '-12-31'
    WHEN d->>'precision' = 'month' THEN left(d->>'date', 7) || '-31'
    ELSE d->>'date'
  END`;

/* An opportunity stays open until every action date it carries has passed. */
export const OPEN_OPPORTUNITY_SQL = `
  (i.opportunity AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(i.entities->'deadlines', '[]'::jsonb)) d
     WHERE ${KIND_SQL} = 'action'
       AND d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
   ) OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(i.entities->'deadlines', '[]'::jsonb)) d
     WHERE ${KIND_SQL} = 'action'
       AND d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
       AND ${END_SQL} >= to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')
   ))`;

export function sydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

export function daysUntil(date: string, today: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

export function countdown(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'in 1 day';
  if (days < 14) return `in ${days} days`;
  if (days < 70) return `in ${Math.round(days / 7)} weeks`;
  const months = Math.max(2, Math.round(days / 30.44));
  return `in ${months} months`;
}

export function urgency(days: number): string {
  if (days <= 7) return 'due-soon';
  if (days <= 30) return 'due-near';
  return 'due-later';
}

export function monthHeading(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined);

/*
 * Every relevant item carrying a date that could still show on the page: in
 * the recently-closed window or later, or a year-precision date this year.
 * Selection, merging and grouping happen in deadline-model.ts, where they are
 * unit-tested; the set is small (a few hundred dates at most).
 */
async function getDeadlineItems(closedDays: number): Promise<DeadlineItem[]> {
  const days = Math.max(0, Math.floor(closedDays));
  const { rows } = await getPool().query<DeadlineItem>(
    `SELECT i.id, i.title, i.url, i.published_at, i.entities->'deadlines' AS deadlines,
            i.entities->>'deadlines_verified_at' AS verified_at
     FROM items i
     WHERE i.relevant
       AND jsonb_typeof(i.entities->'deadlines') = 'array'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(i.entities->'deadlines') d
         WHERE d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
           AND ${END_SQL} >= to_char(
             least(date_trunc('year', now() AT TIME ZONE 'Australia/Sydney'),
                   (now() AT TIME ZONE 'Australia/Sydney') - interval '${days} days'),
             'YYYY-MM-DD'))
     ORDER BY i.id`,
  );
  return withCleanTitles(rows);
}

/*
 * The /deadlines page: primary closing dates (one card per deadline, merged
 * across the items that report it), a calendar of every other future date,
 * and primary dates that closed in the last `closedDays` days.
 */
export async function getDeadlineView(closedDays = 30): Promise<DeadlineView> {
  return buildDeadlineView(await getDeadlineItems(closedDays), sydneyToday(), closedDays);
}

/* The soonest closing cards, for the feed rail and the weekly brief. */
export async function getUpcomingDeadlines(limit?: number): Promise<DeadlineCard[]> {
  const { closing } = await getDeadlineView(0);
  return limit ? closing.slice(0, Math.floor(limit)) : closing;
}
