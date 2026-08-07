import { DeadlineTimeline } from '../deadlines';
import { getRecentlyPassed, getUpcomingDeadlines, safeHref } from '../../lib/deadline-data';

export const dynamic = 'force-dynamic';

export default async function DeadlinesPage() {
  const [upcoming, passed] = await Promise.all([getUpcomingDeadlines(), getRecentlyPassed(30)]);

  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">Consultations · submissions · grants</p>
        <h1 className="page-title">Deadlines</h1>
        <p className="page-intro">
          Closing dates extracted from the items on the radar, newest deadline first. Each entry
          links back to the source it was read from.
        </p>
      </header>

      <div className="workspace reveal reveal-1" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <section className="workspace-main" aria-labelledby="upcoming-deadlines-heading">
          <h2 id="upcoming-deadlines-heading" className="day-heading">
            Upcoming deadlines
          </h2>
          <DeadlineTimeline rows={upcoming} />

          {passed.length > 0 ? (
            <section aria-label="Recently passed" style={{ marginTop: '2.5rem' }}>
              <h2 className="day-heading">
                Recently passed
                <span className="day-count">last 30 days</span>
              </h2>
              {passed.map((r, n) => {
                const href = safeHref(r.url);
                return (
                  <div className="passed-entry" key={`${r.date}-${n}`}>
                    <time dateTime={r.date}>
                      {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </time>
                    <span>
                      {r.label} —{' '}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                    </span>
                  </div>
                );
              })}
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
}
