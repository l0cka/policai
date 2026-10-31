import {
  countdown,
  daysUntil,
  safeHref,
  sydneyToday,
  urgency,
  type DeadlineCard,
} from '../lib/deadline-data';
import { deadlineDateTime, formatDeadlineDate, type SecondaryDate } from '../lib/deadline-model';

/*
 * Every dated list on the site uses one row grammar: the date sits in its own
 * left-hand column so the dates line up down the page, the subject leads the
 * body, and the kind of date is a tag beneath it.
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

/* When the verifier last re-read the source. It rides on the label line,
 * "Submissions close · checked 21 Oct", rather than taking a line of its own. */
function Checked({ row }: { row: DeadlineCard }) {
  if (!row.checkedOn) return null;
  return (
    <>
      <span className="timeline-sep">{' · '}</span>
      <span className="timeline-checked">checked <time dateTime={row.checkedOn}>{formatDeadlineDate(row.checkedOn, 'day', false)}</time></span>
    </>
  );
}

/* Other dates from the same item, beneath its headline deadline. */
function SecondaryDates({ dates }: { dates: SecondaryDate[] }) {
  if (!dates.length) return null;
  return (
    <ul className="deadline-secondary" aria-label="Other dates in this item">
      {dates.map((d) => (
        <li key={`${d.date}-${d.label}`}>
          <time dateTime={deadlineDateTime(d.date, d.precision)}>{formatDeadlineDate(d.date, d.precision, false)}</time>{' '}
          {d.label}
        </li>
      ))}
    </ul>
  );
}

/*
 * Closing dates group by the week they fall in, Monday to Sunday, so the
 * strip above the list can show where the deadlines bunch up. Weeks beyond the
 * strip collapse into one "Later" group.
 */
const STRIP_WEEKS = 8;

type WeekGroup = { id: string; heading: string; rows: DeadlineCard[] };
type Week = WeekGroup & { start: string };

const MS_DAY = 86_400_000;
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, n: number) => new Date(utcDate(date).getTime() + n * MS_DAY).toISOString().slice(0, 10);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (date: string) => WEEKDAYS[utcDate(date).getUTCDay()];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (date: string) => MONTHS[utcDate(date).getUTCMonth()];
const dayMonth = (date: string) => formatDeadlineDate(date, 'day', false);

function weekHeading(i: number, start: string): string {
  const range = `${dayMonth(start)} to ${dayMonth(addDays(start, 6))}`;
  if (i === 0) return `This week · ${range}`;
  if (i === 1) return `Next week · ${range}`;
  return `Week of ${dayMonth(start)}`;
}

function byWeek(rows: DeadlineCard[], today: string): { weeks: Week[]; later: WeekGroup } {
  const monday = addDays(today, -((utcDate(today).getUTCDay() + 6) % 7));
  const weeks: Week[] = Array.from({ length: STRIP_WEEKS }, (_, i) => {
    const start = addDays(monday, i * 7);
    return { id: `week-${start}`, start, heading: weekHeading(i, start), rows: [] };
  });
  const later: WeekGroup = { id: 'later', heading: 'Later', rows: [] };
  for (const r of rows) (weeks[Math.floor(daysUntil(r.date, monday) / 7)] ?? later).rows.push(r);
  return { weeks, later };
}

/* One bar per week; a bar's colour is its soonest deadline's, as on the rows. */
export function DeadlineWeekStrip({ rows }: { rows: DeadlineCard[] }) {
  if (!rows.length) return null;
  const today = sydneyToday();
  const { weeks } = byWeek(rows, today);
  const most = Math.max(1, ...weeks.map((w) => w.rows.length));
  return (
    <nav className="week-strip" aria-label="Closing dates by week">
      {weeks.map((w, i) => {
        const n = w.rows.length;
        const tone = n ? urgency(daysUntil(w.rows[0].date, today)) : '';
        const Tag = n ? 'a' : 'span';
        return (
          <Tag
            key={w.id}
            href={n ? `#${w.id}` : undefined}
            aria-hidden={n ? undefined : true}
            aria-current={i === 0 ? 'date' : undefined}
            className={`week-strip-week${i === 0 ? ' is-current' : ''}`}
          >
            <span className="sr-only">
              {w.heading}: {n} closing
            </span>
            <span className="week-strip-count" aria-hidden="true">{n || ''}</span>
            <span className="week-strip-track" aria-hidden="true">
              <span className={`week-strip-bar ${tone}`} style={{ height: `${n ? Math.max(n / most, 0.4) * 100 : 0}%` }} />
            </span>
            <span className="week-strip-label" aria-hidden="true">
              {i === 0 ? 'Now' : dayMonth(w.start)}
            </span>
          </Tag>
        );
      })}
    </nav>
  );
}

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
  const { weeks, later } = byWeek(rows, today);
  return (
    <>
      {[...weeks, later].map((w) =>
        w.rows.length ? (
          <section className="timeline-week" id={w.id} key={w.id} aria-labelledby={`${w.id}-heading`}>
            <h3 id={`${w.id}-heading`}>{w.heading}</h3>
            {w.rows.map((r, n) => {
              const days = daysUntil(r.date, today);
              return (
                <article className="timeline-entry" key={`${r.key}-${n}`}>
                  <div className={`date-block ${urgency(days)}`} aria-hidden="true">
                    <span className="day">{utcDate(r.date).getUTCDate()}</span>
                    <span className="mon">{weekday(r.date)}</span>
                    <span className="mon mon-month">{month(r.date)}</span>
                  </div>
                  <div className="timeline-body">
                    <h4 className="timeline-subject">
                      <Subject row={r} />
                    </h4>
                    <p className="timeline-kind">
                      <span className="sr-only">{weekday(r.date)} {formatDeadlineDate(r.date, 'day')}: </span>
                      {r.label}
                      <span className="timeline-sep">{' · '}</span>
                      <span className={`timeline-countdown ${urgency(days)}`}>
                        <span className="sr-only">closes </span>
                        {countdown(days)}
                      </span>
                      <Checked row={r} />
                    </p>
                    <SecondaryDates dates={r.secondary} />
                    <AlsoReported row={r} />
                  </div>
                </article>
              );
            })}
          </section>
        ) : null,
      )}
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
            <p className="dated-kind">
              {r.label}
              <Checked row={r} />
            </p>
            <AlsoReported row={r} />
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
