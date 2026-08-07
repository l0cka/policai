import { getPool } from './db';

export type DeadlineRow = { title: string; url: string; date: string; label: string };

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
  SELECT DISTINCT ON (d->>'date', d->>'label') i.title, i.url, d->>'date' AS date, d->>'label' AS label
  FROM items i, jsonb_array_elements(i.entities->'deadlines') d
  WHERE i.relevant AND d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'`;

export async function getUpcomingDeadlines(limit?: number): Promise<DeadlineRow[]> {
  const { rows } = await getPool().query<DeadlineRow>(
    `${BASE_QUERY}
       AND (d->>'date') >= to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')
     ORDER BY d->>'date' ASC, d->>'label' ASC
     ${limit ? `LIMIT ${Math.floor(limit)}` : ''}`,
  );
  return rows;
}

export async function getRecentlyPassed(days: number): Promise<DeadlineRow[]> {
  const { rows } = await getPool().query<DeadlineRow>(
    `${BASE_QUERY}
       AND (d->>'date') < to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')
       AND (d->>'date') >= to_char((now() AT TIME ZONE 'Australia/Sydney') - interval '${Math.floor(days)} days', 'YYYY-MM-DD')
     ORDER BY d->>'date' DESC, d->>'label' ASC`,
  );
  return rows;
}
