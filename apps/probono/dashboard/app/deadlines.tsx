import {
  countdown,
  daysUntil,
  monthHeading,
  safeHref,
  sydneyToday,
  urgency,
  type DeadlineRow,
} from '../lib/deadline-data';

/*
 * Every dated list on the site uses one row grammar: the subject leads, the
 * kind of date is a tag beneath it, and the timing sits in its own right-hand
 * column so the countdowns line up and can be compared down the page.
 *
 * The subject is the item's title rather than the deadline's label because the
 * labels repeat — three consecutive rows all read "Submissions close", and it
 * is the headline that tells you which consultation you are looking at.
 */

function longDate(date: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

function Subject({ row }: { row: DeadlineRow }) {
  const href = safeHref(row.url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {row.title}
    </a>
  ) : (
    <span>{row.title}</span>
  );
}

// Month-grouped agenda timeline, rendered from rows the caller fetched.
export function DeadlineTimeline({ rows }: { rows: DeadlineRow[] }) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        <p className="section-title">Nothing closing</p>
        <p>No open closing dates have been extracted from the sources yet.</p>
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
        <section className="timeline-month" key={month}>
          <h3>{monthHeading(entries[0].date)}</h3>
          {entries.map((r, n) => {
            const days = daysUntil(r.date, today);
            return (
              <article className="timeline-entry" key={`${r.date}-${n}`}>
                <div className={`date-block ${urgency(days)}`} aria-hidden="true">
                  <span className="day">{Number(r.date.slice(8, 10))}</span>
                  <span className="mon">
                    {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', { month: 'short' })}
                  </span>
                </div>

                <div className="timeline-body">
                  <h4 className="timeline-subject">
                    <Subject row={r} />
                  </h4>
                  <p className="timeline-kind">{r.label}</p>
                </div>

                <span className={`chip ${urgency(days)}`}>
                  <span className="sr-only">Closes </span>
                  {countdown(days)}
                </span>
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}

/*
 * The quieter list used for the sector calendar and for dates that have just
 * passed. Same grammar, no urgency colour: nothing here is chaseable, so
 * nothing should look like it is.
 */
export function DeadlineList({ rows, showYear = true }: { rows: DeadlineRow[]; showYear?: boolean }) {
  if (!rows.length) return null;

  return (
    <div className="dated-list">
      {rows.map((r, n) => (
        <article className="dated-row" key={`${r.date}-${n}`}>
          <time className="dated-when" dateTime={r.date}>
            {longDate(r.date, showYear)}
          </time>
          <div className="dated-body">
            <p className="dated-subject">
              <Subject row={r} />
            </p>
            <p className="dated-kind">{r.label}</p>
          </div>
        </article>
      ))}
    </div>
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
        const href = safeHref(r.url);
        return (
          <div className="rail-deadline" key={`${r.date}-${n}`}>
            <time dateTime={r.date}>{longDate(r.date, false)}</time>
            <span className="rail-deadline-label">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {r.title}
                </a>
              ) : (
                r.title
              )}
              <span className={`rail-deadline-count ${urgency(days)}`}>
                {r.label} &middot; {countdown(days)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
