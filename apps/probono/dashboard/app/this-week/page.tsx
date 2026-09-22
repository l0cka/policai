import type { Metadata } from 'next';
import Link from 'next/link';
import { countdown, daysUntil, safeHref, urgency } from '../../lib/deadline-data';
import { getWeeklyBrief, type WeeklySignal } from '../../lib/this-week-data';
import { STREAMS } from '../../lib/radar-state';
import { ArrowRight, ArrowUpRight, Flag } from '../icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'This week — Policai A2J',
  description: 'A rolling seven-day radar brief, potential opportunities and upcoming deadlines, linked to their sources.',
};

function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' });
}

function Signal({ item, opportunity = false }: { item: WeeklySignal; opportunity?: boolean }) {
  const href = safeHref(item.url);
  const knownStream = item.stream && Object.prototype.hasOwnProperty.call(STREAMS, item.stream) ? item.stream : null;
  const style = knownStream ? {
    '--rail-color': `var(--s-${knownStream})`,
    '--badge-bg': `var(--s-${knownStream}-bg)`,
    '--badge-fg': `var(--s-${knownStream})`,
  } as React.CSSProperties : undefined;
  return (
    <article className="item ink-rail" style={style} data-record-id={item.id}>
      <div className="item-meta"><span className="badge">{knownStream ? STREAMS[knownStream] : 'Unclassified'}</span></div>
      <div className="item-body">
        <h3>{href ? <a className="item-title" href={href} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight /></a> : <span className="item-title">{item.title}</span>}</h3>
        {item.blurb || item.excerpt ? <p className="item-blurb">{item.blurb ?? item.excerpt}</p> : null}
        {opportunity ? <p className="item-flag"><Flag />{item.opportunity_reason ?? 'Potential opportunity; check eligibility and closing dates at the source.'}</p> : null}
        <p className="item-source-inline">{item.source_name} · {shortDate(item.published_at ?? item.created_at)}</p>
      </div>
      <div className="item-source">{shortDate(item.published_at ?? item.created_at)}<br />{item.source_name}</div>
    </article>
  );
}

export default async function ThisWeek() {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const start = new Date(now.getTime() - 7 * 86400000);
  const { opportunities, deadlines, developments, totalDevelopments } = await getWeeklyBrief(now);
  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">The rolling brief</p>
        <h1 className="page-title">This week</h1>
        <p className="page-intro">What to read and what to check next: recent sector signals, potential opportunities and upcoming closing dates. These are machine-selected leads, not editorially verified advice. Check each linked source before acting.</p>
        <p className="page-intro">Seven-day window: {shortDate(start)}–{shortDate(now)}, ending at {now.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}. Dates use Sydney time. <Link href="/health">Check source coverage</Link>.</p>
        <nav className="filters" aria-label="Weekly sections">
          <a href="#week-opportunities">Opportunities</a><a href="#week-deadlines">Deadlines</a><a href="#week-developments">Recent signals</a>
        </nav>
      </header>
      <div className="workspace reveal reveal-1" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div className="workspace-main">
          <section id="week-opportunities" aria-labelledby="week-opportunities-heading">
            <h2 id="week-opportunities-heading" className="day-heading">Potential opportunities<span className="day-count">{opportunities.rows.length} of {opportunities.pagination.total} shown</span></h2>
            <p className="page-intro">Not recorded as closed. Includes older opportunities and items without a known closing date; availability and eligibility still need checking.</p>
            {opportunities.rows.length ? opportunities.rows.map(item => <Signal key={item.id} item={item} opportunity />) : <div className="empty-state"><p className="section-title">No potential opportunities recorded</p><p>This reflects the current radar data, not the absence of opportunities.</p></div>}
            <Link href="/?opp=1#radar-feed" className="rail-more">All opportunities <ArrowRight /></Link>
          </section>
          <section id="week-deadlines" aria-labelledby="week-deadlines-heading" className="dated-section">
            <h2 id="week-deadlines-heading" className="day-heading">Approaching deadlines<span className="day-count">Up to five · soonest first</span></h2>
            {deadlines.length ? <div className="dated-list">{deadlines.map((r, n) => {
              const days = daysUntil(r.date, today);
              const href = safeHref(r.url);
              return <article className="dated-row" key={`${r.date}-${n}`}>
                <time className="dated-when" dateTime={r.date}>{shortDate(`${r.date}T00:00:00Z`)}</time>
                <div className="dated-body"><p className="dated-subject">{href ? <a href={href} target="_blank" rel="noopener noreferrer">{r.title}</a> : r.title}</p><p className="dated-kind">{r.label}</p></div>
                <span className={`chip ${urgency(days)}`}><span className="sr-only">Closes </span>{countdown(days)}</span>
              </article>;
            })}</div> : <div className="empty-state"><p className="section-title">No upcoming deadlines recorded</p><p>Closing dates may be missing from the data. Check the original opportunity.</p></div>}
            <Link href="/deadlines" className="rail-more">All deadlines <ArrowRight /></Link>
          </section>
          <section id="week-developments" aria-labelledby="week-developments-heading" className="dated-section">
            <h2 id="week-developments-heading" className="day-heading">Recent sector signals<span className="day-count">Last seven days · {developments.length} of {totalDevelopments} shown</span></h2>
            <p className="page-intro">Newest first, using publication date where recorded, otherwise collection date. A relevance flag is not a finding of legal significance.</p>
            {developments.length ? developments.map(item => <Signal key={item.id} item={item} />) : <div className="empty-state"><p className="section-title">No recent signals recorded</p><p>No relevant items fall in this seven-day window. Check source coverage before treating it as a quiet week.</p></div>}
            <Link href="/#radar-feed" className="rail-more">Browse the full radar <ArrowRight /></Link>
          </section>
        </div>
      </div>
    </div>
  );
}
