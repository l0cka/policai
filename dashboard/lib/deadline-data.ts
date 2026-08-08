import { getPool } from './db';

export type DeadlineKind = 'action' | 'milestone';
export type DeadlineRow = { title: string; url: string; date: string; label: string; kind: DeadlineKind };

/*
 * Enrichment records `kind` on each deadline, but rows written before that
 * field existed have none. Fall back to reading the label: dates a reader must
 * act on almost always say so in the verb. "UN report due" is the known
 * misfire — it reads as an action and is a milestone — and it corrects itself
 * once the item is re-enriched.
 */
const KIND_SQL = `
  coalesce(
    d->>'kind',
    CASE WHEN d->>'label' ~* '(clos|due|deadline|appl|submi|register|registration|nominat|expression of interest|\\mEOI\\M|tender)'
         THEN 'action' ELSE 'milestone' END
  )`;

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
       AND (d->>'date') >= to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')
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

const BASE_QUERY = `
  SELECT DISTINCT ON (d->>'date', d->>'label')
         i.title, i.url, d->>'date' AS date, d->>'label' AS label, ${KIND_SQL} AS kind
  FROM items i, jsonb_array_elements(i.entities->'deadlines') d
  WHERE i.relevant AND d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'`;

const TODAY_SQL = `to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')`;

/*
 * Things a reader can still act on. This is what the page leads with, and what
 * the phrase "deadline" is reserved for.
 */
export async function getUpcomingDeadlines(limit?: number): Promise<DeadlineRow[]> {
  const { rows } = await getPool().query<DeadlineRow>(
    `SELECT * FROM (${BASE_QUERY}
       AND (d->>'date') >= ${TODAY_SQL}) q
     WHERE q.kind = 'action'
     ORDER BY q.date ASC, q.label ASC
     ${limit ? `LIMIT ${Math.floor(limit)}` : ''}`,
  );
  return rows;
}

/* Dates that will simply arrive: reports handed down, schemes starting, plans
 * concluding. Worth knowing, never worth chasing. */
export async function getUpcomingMilestones(limit?: number): Promise<DeadlineRow[]> {
  const { rows } = await getPool().query<DeadlineRow>(
    `SELECT * FROM (${BASE_QUERY}
       AND (d->>'date') >= ${TODAY_SQL}) q
     WHERE q.kind = 'milestone'
     ORDER BY q.date ASC, q.label ASC
     ${limit ? `LIMIT ${Math.floor(limit)}` : ''}`,
  );
  return rows;
}

export async function getRecentlyPassed(days: number): Promise<DeadlineRow[]> {
  const { rows } = await getPool().query<DeadlineRow>(
    `SELECT * FROM (${BASE_QUERY}
       AND (d->>'date') < ${TODAY_SQL}
       AND (d->>'date') >= to_char((now() AT TIME ZONE 'Australia/Sydney') - interval '${Math.floor(days)} days', 'YYYY-MM-DD')) q
     WHERE q.kind = 'action'
     ORDER BY q.date DESC, q.label ASC`,
  );
  return rows;
}
