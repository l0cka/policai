import Link from 'next/link';
import { getRadarPage, getRadarStats, getRadarSourceStats, getRadarOverview } from '../lib/radar-data';
import { STREAMS, parseRadarState, type RadarSearchParams } from '../lib/radar-state';
import { RadarControls, RadarPagination } from './radar-controls';
import { RailDeadlines } from './deadlines';
import {
  daysUntil,
  getUpcomingDeadlines,
  sydneyToday,
  safeHref,
} from '../lib/deadline-data';
import { ArrowRight, ArrowUpRight, Flag, Search } from './icons';
import { SignalNetwork } from './signal-network';

export const dynamic = 'force-dynamic';

const SYDNEY_DATE = { timeZone: 'Australia/Sydney' } as const;

function sydneyDateOf(ts: string | Date): string {
  return new Date(ts).toLocaleDateString('en-CA', SYDNEY_DATE);
}

function dayLabel(date: string, today: string): string {
  const diff = daysUntil(date, today);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  const d = new Date(`${date}T00:00:00`);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('en-AU', {
    weekday: diff > -7 ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  });
}

/*
 * Stream accents live in CSS as `--s-<stream>` / `--s-<stream>-bg`. Passing the
 * token name rather than a colour keeps the palette in one file and lets both
 * themes resolve through light-dark().
 */
function streamVars(stream: string | null): React.CSSProperties | undefined {
  if (!stream || !Object.prototype.hasOwnProperty.call(STREAMS, stream)) return undefined;
  return {
    '--rail-color': `var(--s-${stream})`,
    '--badge-bg': `var(--s-${stream}-bg)`,
    '--badge-fg': `var(--s-${stream})`,
  } as React.CSSProperties;
}

function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}


export default async function Feed({ searchParams }: { searchParams: Promise<RadarSearchParams> }) {
  const state = parseRadarState(await searchParams);
  const { stream, q, opp, filtered } = state;
  const isResearch = Boolean(stream || q || opp || filtered || state.page > 1);
  const [{ rows, pagination }, stats, sources, deadlines, overview] = await Promise.all([
    getRadarPage(state), getRadarStats(), getRadarSourceStats(), getUpcomingDeadlines(5),
    isResearch ? null : getRadarOverview(),
  ]);
  const { networkPairs = [], networkSignals = [], latestItems = [] } = overview ?? {};

  const today = sydneyToday();
  const staleSources = sources.overdue > 0 || sources.ok < sources.total;
  const groups: Array<{ date: string; rows: typeof rows }> = [];
  for (const r of rows) {
    const date = sydneyDateOf(r.published_at ?? r.created_at);
    const last = groups.at(-1);
    if (last && last.date === date) last.rows.push(r);
    else groups.push({ date, rows: [r] });
  }

  return (
    <>
      {!isResearch ? <section className="observatory-hero">
        <div className="container observatory-grid">
          <div className="observatory-copy reveal">
            <p className="observatory-eyebrow">The Australian access-to-justice radar</p>
            <h1>Access to justice.</h1>
            <p className="observatory-intro">
              Policai A2J tracks pro bono, law reform, legal-assistance funding and justice
              technology across Australia, with every signal linked to its source.
            </p>

            <form id="hero-radar-search" action="/#radar-feed" method="get" className="hero-search">
              {stream ? <input type="hidden" name="stream" value={stream} /> : null}
              {opp === '1' ? <input type="hidden" name="opp" value="1" /> : null}
              {filtered === '1' ? <input type="hidden" name="filtered" value="1" /> : null}
              <Search />
              <label className="sr-only" htmlFor="hero-search">Search the radar</label>
              <input id="hero-search" name="q" placeholder="Search signals, sources or topics" defaultValue={q ?? ''} />
            </form>

            <div className="observatory-actions">
              <button type="submit" form="hero-radar-search" className="button-primary">
                Search the radar <ArrowRight />
              </button>
              <Link href="/deadlines" className="button-quiet">
                View deadlines <ArrowRight />
              </Link>
            </div>

            <dl className="observatory-stats">
              <div><dd>{stats.new_week}</dd><dt>new this week</dt></div>
              <div><dd>{stats.opportunities}</dd><dt>opportunities</dt></div>
              <div><dd>{stats.tracked}</dd><dt>items tracked</dt></div>
              <div><dd>{sources.total}</dd><dt>sources monitored</dt></div>
            </dl>
          </div>

          <details className="signal-disclosure">
            <summary>Explore the signal network <span>Sources, signals and collections · last 30 days</span></summary>
            <div className="observatory-visual">
              <SignalNetwork pairs={networkPairs} signals={networkSignals} />
            </div>
          </details>
        </div>
      </section> : (
        <header className="container research-heading">
          <p className="page-eyebrow">The Australian access-to-justice radar</p>
          <h1>Search the radar</h1>
          <p>Browse source-linked news, law reform, funding and justice technology.</p>
        </header>
      )}

      {latestItems.length ? (
        <section className="recent-signals">
          <div className="container">
            <div className="recent-signals-head">
              <p>What changed recently</p>
              <a href="#radar-feed">View the full radar <ArrowRight /></a>
            </div>
            <div className="recent-signals-grid">
              {latestItems.map((item) => {
                const href = safeHref(item.url);
                return (
                  <article key={item.id}>
                    <time>{shortDate(item.published_at ?? item.created_at)}</time>
                    <h2>
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{item.title} <ArrowUpRight /></a> : item.title}
                    </h2>
                    <p>{item.blurb ?? item.excerpt ?? 'Open the source record for more detail.'}</p>
                    <span className="recent-source"><i /> {item.stream ? STREAMS[item.stream] : 'Unclassified'} <b /> {item.source_name}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="radar-register" id="radar-feed">
        <div className="container page">
          <header className="register-heading reveal">
            <div>
              <p className="page-eyebrow">Source-linked signals</p>
              <h2 className="register-title">Radar feed</h2>
            </div>
            <p className={`signal ${sources.ok === sources.total ? 'signal-ok' : 'signal-warn'}`}>
              <span className="signal-dot" />
              {sources.ok} of {sources.total} sources reporting
            </p>
          </header>

          <RadarControls state={state} />

          <div className="workspace">
        <div className="workspace-main">
          {rows.length === 0 ? (
            <div className="empty-state">
              <p className="section-title">Nothing matches</p>
              <p>{isResearch ? 'Try fewer filters or a broader search.' : 'No signals have been collected yet.'}</p>
              {isResearch ? <Link className="button-primary" href="/#radar-feed">Clear search and filters <ArrowRight /></Link> : null}
            </div>
          ) : null}

          <RadarPagination state={state} pagination={pagination} />
          {groups.map((g) => (
            <section className="day-group" key={g.date} aria-label={dayLabel(g.date, today)}>
              <h3 className="day-heading">
                {dayLabel(g.date, today)}
                <span className="day-count">{g.rows.length}</span>
              </h3>
              {g.rows.map((i) => {
                const href = safeHref(i.url);
                return (
                  <article data-record-id={i.id} className="item ink-rail" style={streamVars(i.stream)} key={i.id}>
                    <div className="item-meta">
                      <span className="badge">{i.stream ? STREAMS[i.stream] : 'Unclassified'}</span>
                    </div>
                    <div className="item-body">
                      <h4>
                        {href ? (
                          <a
                            className="item-title"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {i.title}
                            <ArrowUpRight />
                          </a>
                        ) : (
                          <span className="item-title">{i.title}</span>
                        )}
                      </h4>
                      {i.blurb || i.excerpt ? (
                        <p className="item-blurb">{i.blurb ?? i.excerpt}</p>
                      ) : null}
                      {i.opportunity_open ? (
                        <p className="item-flag">
                          <Flag />
                          {i.opportunity_reason}
                        </p>
                      ) : null}
                      <p className="item-source-inline">{i.source_name}</p>
                    </div>
                    <div className="item-source">{i.source_name}</div>
                  </article>
                );
              })}
            </section>
          ))}
          <RadarPagination state={state} pagination={pagination} position="bottom" />
        </div>

        <aside className="rail">
          <section>
            <h2>Upcoming deadlines</h2>
            <RailDeadlines rows={deadlines} today={today} />
            <Link href="/deadlines" className="rail-more">
              All deadlines <ArrowRight />
            </Link>
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2>Collection status</h2>
            <div className="rail-card">
              <p className={`signal ${staleSources ? 'signal-warn' : 'signal-ok'}`}>
                <span className="signal-dot" />
                {sources.ok === sources.total ? 'All sources reporting' : staleSources ? 'Some sources overdue' : 'Some sources stale'}
              </p>
              <p className="rail-note">
                {sources.ok === sources.total
                  ? `${sources.ok} of ${sources.total} sources returned on their last run`
                  : `${sources.overdue} of ${sources.total} sources have not returned a run within three days`}
              </p>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div className="meter">
                <span>Reporting</span>
                <span className="meter-track">
                  <span
                    className="meter-fill"
                    style={{
                      width: `${sources.total ? Math.round((sources.ok / sources.total) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="meter-value">
                  {sources.total ? Math.round((sources.ok / sources.total) * 100) : 0}%
                </span>
              </div>
            </div>
            <Link href="/health" className="rail-more">
              Source health <ArrowRight />
            </Link>
          </section>
        </aside>
          </div>
        </div>
      </section>
    </>
  );
}
