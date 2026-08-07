import {
  countdown,
  daysUntil,
  monthHeading,
  safeHref,
  sydneyToday,
  urgency,
  type DeadlineRow,
} from '../lib/deadline-data';

// Month-grouped agenda timeline, rendered from rows the caller fetched.
export function DeadlineTimeline({ rows }: { rows: DeadlineRow[] }) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        <p className="section-title">No upcoming deadlines</p>
        <p>None have been extracted from the sources yet.</p>
      </div>
    );
  }

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
          <h3>{monthHeading(entries[0].date)}</h3>
          {entries.map((r, n) => {
            const days = daysUntil(r.date, today);
            const href = safeHref(r.url);
            return (
              <div className="timeline-entry" key={`${r.date}-${n}`}>
                <div className={`date-block ${urgency(days)}`}>
                  <span className="day">{Number(r.date.slice(8, 10))}</span>
                  <span className="mon">
                    {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', {
                      month: 'short',
                    })}
                  </span>
                </div>
                <div className="timeline-body">
                  <div className="timeline-label">
                    <strong>{r.label}</strong>
                    <span className={`chip ${urgency(days)}`}>{countdown(days)}</span>
                  </div>
                  <div className="timeline-title">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
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

/*
 * The compact list in the feed's right rail. It takes rows the feed already
 * fetched rather than querying again, so the page issues one round trip for
 * deadlines whichever component renders them.
 */
export function RailDeadlines({ rows, today }: { rows: DeadlineRow[]; today: string }) {
  if (!rows.length) {
    return <p className="rail-note">None extracted yet.</p>;
  }

  return (
    <div className="rail-card">
      {rows.map((r, n) => {
        const days = daysUntil(r.date, today);
        return (
          <div className="rail-deadline" key={`${r.date}-${n}`}>
            <time dateTime={r.date}>
              {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
              })}
            </time>
            <span className="rail-deadline-label">
              {r.label}
              <span className={`rail-deadline-count ${urgency(days)}`}>{countdown(days)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
