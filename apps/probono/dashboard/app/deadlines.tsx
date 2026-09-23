import {
  countdown,
  daysUntil,
  monthHeading,
  safeHref,
  sydneyToday,
  urgency,
  type DeadlineCard,
} from '../lib/deadline-data';
import { deadlineDateTime, formatDeadlineDate, type SecondaryDate } from '../lib/deadline-model';

/*
 * Every dated list on the site uses one row grammar: the subject leads, the
 * kind of date is a tag beneath it, and the timing sits in its own right-hand
 * column so the countdowns line up and can be compared down the page.
 *
 * The subject is the item's title rather than the deadline's label because the
 * labels repeat — three consecutive rows all read "Submissions close", and it
 * is the headline that tells you which consultation you are looking at.
 */

function Subject({ row }: { row: DeadlineCard }) {
  const href = safeHref(row.url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {row.title}
    </a>
  ) : (
    <span>{row.title}</span>
  );
}

/*
 * The same deadline reported by other items (a law-firm write-up of an
 * official consultation, say). The card links to the preferred source; the
 * others stay reachable here.
 */
function AlsoReported({ row }: { row: DeadlineCard }) {
  const others = row.alsoReportedBy;
  if (!others.length) return null;
  return (
    <p className="deadline-also">
      Also reported by {others.length}:{' '}
      {others.map((o, n) => {
        const href = safeHref(o.url);
        return (
          <span key={o.itemId}>
            {n ? '; ' : ''}
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {o.title}
              </a>
            ) : (
              o.title
            )}
          </span>
        );
      })}
    </p>
  );
}

/* When the verifier last re-read the source for this date. */
function Checked({ row }: { row: DeadlineCard }) {
  if (!row.checkedOn) return null;
  return (
    <p className="deadline-checked">
      Checked against the source <time dateTime={row.checkedOn}>{formatDeadlineDate(row.checkedOn, 'day', false)}</time>
    </p>
  );
}

/* Other dates from the same item, beneath its headline deadline. */
function SecondaryDates({ dates }: { dates: SecondaryDate[] }) {
  if (!dates.length) return null;
  return (
    <ul className="deadline-secondary" aria-label="Other dates in this item">
      {dates.map((d) => (
        <li key={`${d.date}-${d.label}`}>
          <time dateTime={deadlineDateTime(d.date, d.precision)}>{formatDeadlineDate(d.date, d.precision)}</time>{' '}
          {d.label}
        </li>
      ))}
    </ul>
  );
}

// Month-grouped agenda timeline, rendered from rows the caller fetched.
export function DeadlineTimeline({ rows }: { rows: DeadlineCard[] }) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        <p className="section-title">Nothing closing</p>
        <p>No open closing dates have been extracted from the sources yet.</p>
      </div>
    );
  }

  const today = sydneyToday();
  const months = new Map<string, DeadlineCard[]>();
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
              <article className="timeline-entry" key={`${r.key}-${n}`}>
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
                  <p className="timeline-kind">
                    <span className="sr-only">
                      {formatDeadlineDate(r.date, 'day')}:{' '}
                    </span>
                    {r.label}
                  </p>
                  <SecondaryDates dates={r.secondary} />
                  <Checked row={r} />
                  <AlsoReported row={r} />
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
 * nothing should look like it is. Dates keep the precision the source gave:
 * "Sep 2026" or "2027", never an invented day.
 */
export function DeadlineList({ rows, showYear = true }: { rows: DeadlineCard[]; showYear?: boolean }) {
  if (!rows.length) return null;

  return (
    <div className="dated-list">
      {rows.map((r, n) => (
        <article className="dated-row" key={`${r.key}-${n}`}>
          <time className="dated-when" dateTime={deadlineDateTime(r.date, r.precision)}>
            {formatDeadlineDate(r.date, r.precision, showYear)}
          </time>
          <div className="dated-body">
            <p className="dated-subject">
              <Subject row={r} />
            </p>
            <p className="dated-kind">{r.label}</p>
            <AlsoReported row={r} />
            <Checked row={r} />
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
export function RailDeadlines({ rows, today }: { rows: DeadlineCard[]; today: string }) {
  if (!rows.length) {
    return <p className="rail-note">None extracted yet.</p>;
  }

  return (
    <div className="rail-card">
      {rows.map((r, n) => {
        const days = daysUntil(r.date, today);
        const href = safeHref(r.url);
        return (
          <div className="rail-deadline" key={`${r.key}-${n}`}>
            <time dateTime={r.date}>{formatDeadlineDate(r.date, 'day', false)}</time>
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
