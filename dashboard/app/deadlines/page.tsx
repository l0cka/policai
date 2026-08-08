import { DeadlineList, DeadlineTimeline } from '../deadlines';
import {
  getRecentlyPassed,
  getUpcomingDeadlines,
  getUpcomingMilestones,
} from '../../lib/deadline-data';

export const dynamic = 'force-dynamic';

export default async function DeadlinesPage() {
  const [upcoming, milestones, passed] = await Promise.all([
    getUpcomingDeadlines(),
    getUpcomingMilestones(),
    getRecentlyPassed(30),
  ]);

  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">Consultations · submissions · grants</p>
        <h1 className="page-title">Deadlines</h1>
        <p className="page-intro">
          Closing dates extracted from the items on the radar, soonest first. Each entry links back
          to the source it was read from. Dates that simply arrive — reports handed down, schemes
          starting — are listed separately below.
        </p>
      </header>

      <div className="workspace reveal reveal-1" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <section className="workspace-main" aria-labelledby="closing-heading">
          <h2 id="closing-heading" className="day-heading">
            Closing soon
            {upcoming.length ? <span className="day-count">{upcoming.length}</span> : null}
          </h2>
          <DeadlineTimeline rows={upcoming} />

          {milestones.length > 0 ? (
            <section className="dated-section" aria-labelledby="calendar-heading">
              <h2 id="calendar-heading" className="day-heading">
                Sector calendar
                <span className="day-count">nothing to lodge</span>
              </h2>
              <p className="dated-note">
                Dates worth knowing that carry no action: inquiries reporting, schemes commencing,
                plans concluding.
              </p>
              <DeadlineList rows={milestones} />
            </section>
          ) : null}

          {passed.length > 0 ? (
            <section className="dated-section" aria-labelledby="closed-heading">
              <h2 id="closed-heading" className="day-heading">
                Recently closed
                <span className="day-count">last 30 days</span>
              </h2>
              <DeadlineList rows={passed} showYear={false} />
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
}
