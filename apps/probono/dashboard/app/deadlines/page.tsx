import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/site-meta';
import { DeadlineList, DeadlineTimeline, DeadlineWeekStrip } from '../deadlines';
import { getDeadlineView } from '../../lib/deadline-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMetadata({
  title: 'Deadlines',
  description:
    'Consultation, submission and grant closing dates from the radar, soonest first, each linked to its source.',
  path: '/deadlines',
});

export default async function DeadlinesPage() {
  const { closing: upcoming, calendar: milestones, closed: passed } = await getDeadlineView(30);

  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">Consultations · submissions · grants</p>
        <h1 className="page-title">Deadlines</h1>
        <p className="page-intro">
          Closing dates read from the sources on the radar, soonest first. Each links to its source.
        </p>
        <DeadlineWeekStrip rows={upcoming} />
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
                events and openings, and dates a source gives only as a month or a year.
              </p>
              <DeadlineList rows={milestones} />
            </section>
          ) : null}

          {passed.length > 0 ? (
            <details className="dated-section dated-closed">
              <summary>
                <h2 className="day-heading">
                  Recently closed
                  <span className="day-count">{passed.length} in the last 30 days</span>
                </h2>
              </summary>
              <DeadlineList rows={passed} showYear={false} />
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}
