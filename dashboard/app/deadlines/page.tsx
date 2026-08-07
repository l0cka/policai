import { DeadlineTimeline } from '../deadlines';
import { getRecentlyPassed, getUpcomingDeadlines, safeHref } from '../../lib/deadline-data';

export const dynamic = 'force-dynamic';

export default async function DeadlinesPage() {
  const [upcoming, passed] = await Promise.all([
    getUpcomingDeadlines(),
    getRecentlyPassed(30),
  ]);

  return (
    <>
      <section className="timeline" aria-label="Upcoming deadlines">
        <span className="stream-pill">Upcoming deadlines</span>
        <DeadlineTimeline rows={upcoming} />
      </section>

      {passed.length > 0 ? (
        <section className="timeline passed" aria-label="Recently passed">
          <span className="stream-pill">Recently passed (last 30 days)</span>
          {passed.map((r, n) => {
            const href = safeHref(r.url);
            return (
              <div className="passed-entry" key={n}>
                <span className="passed-date">
                  {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
                <span>
                  {r.label} — {href ? <a href={href}>{r.title}</a> : r.title}
                </span>
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
