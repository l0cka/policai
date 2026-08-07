import { getPool } from '../lib/db';

type Row = { title: string; url: string; date: string; label: string };

function sydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

function daysUntil(date: string, today: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

function countdown(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'in 1 day';
  if (days < 14) return `in ${days} days`;
  if (days < 70) return `in ${Math.round(days / 7)} weeks`;
  const months = Math.max(2, Math.round(days / 30.44));
  return `in ${months} months`;
}

function urgency(days: number): string {
  if (days <= 7) return 'due-soon';
  if (days <= 30) return 'due-near';
  return 'due-later';
}

function monthHeading(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined);

export default async function Deadlines() {
  const { rows } = await getPool().query<Row>(
    `SELECT DISTINCT ON (d->>'date', d->>'label') i.title, i.url, d->>'date' AS date, d->>'label' AS label
     FROM items i, jsonb_array_elements(i.entities->'deadlines') d
     WHERE i.relevant
       AND d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
       AND (d->>'date') >= to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')
     ORDER BY d->>'date' ASC, d->>'label' ASC
     LIMIT 12`,
  );
  if (!rows.length) return null;

  const today = sydneyToday();
  const months = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(r);
    else months.set(key, [r]);
  }

  return (
    <section className="timeline" aria-label="Upcoming deadlines">
      <span className="stream-pill">Upcoming deadlines</span>
      {[...months.entries()].map(([month, entries]) => (
        <div className="timeline-month" key={month}>
          <h4>{monthHeading(entries[0].date)}</h4>
          {entries.map((r, n) => {
            const days = daysUntil(r.date, today);
            const href = safeHref(r.url);
            return (
              <div className="timeline-entry" key={`${r.date}-${n}`}>
                <div className={`date-block ${urgency(days)}`}>
                  <span className="day">{Number(r.date.slice(8, 10))}</span>
                  <span className="mon">
                    {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', { month: 'short' })}
                  </span>
                </div>
                <div className="timeline-body">
                  <strong>{r.label}</strong>
                  <span className={`chip ${urgency(days)}`}>{countdown(days)}</span>
                  <div className="timeline-item-title">
                    {href ? <a href={href}>{r.title}</a> : r.title}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
