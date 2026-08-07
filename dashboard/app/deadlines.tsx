import Link from 'next/link';
import {
  countdown,
  daysUntil,
  getUpcomingDeadlines,
  monthHeading,
  safeHref,
  sydneyToday,
  urgency,
  type DeadlineRow,
} from '../lib/deadline-data';

// Month-grouped agenda timeline, rendered from rows the caller fetched.
export function DeadlineTimeline({ rows }: { rows: DeadlineRow[] }) {
  if (!rows.length) return <p>No upcoming deadlines extracted yet.</p>;
  const today = sydneyToday();
  const months = new Map<string, DeadlineRow[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(r);
    else months.set(key, [r]);
  }

  return (
    <>
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
    </>
  );
}

// One-line strip on the feed: the next few deadlines, linking to /deadlines.
export default async function DeadlineTeaser() {
  const rows = await getUpcomingDeadlines(3);
  if (!rows.length) return null;
  const today = sydneyToday();
  return (
    <div className="deadline-teaser">
      <span className="stream-pill">Deadlines</span>
      {rows.map((r, n) => {
        const days = daysUntil(r.date, today);
        return (
          <span className={`teaser-item ${urgency(days)}`} key={n}>
            <strong>
              {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </strong>{' '}
            — {r.label}
          </span>
        );
      })}
      <Link href="/deadlines" className="teaser-more">view all →</Link>
    </div>
  );
}
