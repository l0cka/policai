import Link from 'next/link';
import { getPool } from '../lib/db';
import { RailDeadlines } from './deadlines';
import {
  daysUntil,
  getUpcomingDeadlines,
  sydneyToday,
  OPEN_OPPORTUNITY_SQL,
} from '../lib/deadline-data';
import { ArrowRight, ArrowUpRight, Flag, Search } from './icons';
import { SignalNetwork, type NetworkPair, type NetworkSignal } from './signal-network';

export const dynamic = 'force-dynamic';

const STREAMS: Record<string, string> = {
  news: 'News',
  law_reform: 'Law reform',
  funding: 'Funding',
  tech_justice: 'Tech & justice',
};

type Search = { stream?: string; q?: string; opp?: string; filtered?: string };

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

type Stats = { new_week: number; opps: number; tracked: number };
type SourceStats = { total: number; ok: number };
type RadarRow = {
  id: string | number;
  title: string;
  url: string;
  blurb: string | null;
  excerpt: string | null;
  stream: string | null;
  opportunity: boolean;
  opportunity_reason: string | null;
  published_at: string | Date | null;
  created_at: string | Date;
  source_name: string;
};

function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}


/*
 * "Opportunities" counts the ones still open. A consultation whose submissions
 * closed last month is no longer something anyone can act on, and leaving it in
 * the figure makes the number grow forever while meaning less each week.
 */
async function getStats(): Promise<Stats> {
  const { rows } = await getPool().query(
    `SELECT count(*) FILTER (WHERE coalesce(i.published_at, i.created_at) >= now() - interval '7 days') AS new_week,
            count(*) FILTER (WHERE ${OPEN_OPPORTUNITY_SQL}) AS opps,
            count(*) AS tracked
     FROM items i WHERE i.relevant`,
  );
  return rows[0];
}

async function getSourceStats(): Promise<SourceStats> {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE last_status = 'ok')::int AS ok
     FROM (
       SELECT DISTINCT ON (s.id) s.id, r.status AS last_status
       FROM sources s LEFT JOIN ingest_runs r ON r.source_id = s.id
       WHERE s.active
       ORDER BY s.id, r.created_at DESC NULLS LAST
     ) latest`,
  );
  return rows[0];
}

export default async function Feed({ searchParams }: { searchParams: Promise<Search> }) {
  const { stream, q, opp, filtered } = await searchParams;

  const cond: string[] = [filtered === '1' ? 'NOT i.relevant' : 'i.relevant'];
  const args: unknown[] = [];
  if (stream && Object.prototype.hasOwnProperty.call(STREAMS, stream)) {
    args.push(stream);
    cond.push(`i.stream = $${args.length}`);
  }
  if (opp === '1') cond.push(OPEN_OPPORTUNITY_SQL);
  if (q) {
    args.push(q);
    cond.push(`i.search @@ websearch_to_tsquery('english', $${args.length})`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const [{ rows }, { rows: networkPairs }, { rows: networkSignals }, { rows: latestItems }, stats, sources, deadlines] =
    await Promise.all([
      getPool().query(
        `SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream, i.opportunity, i.opportunity_reason,
                ${OPEN_OPPORTUNITY_SQL} AS opportunity_open,
                i.published_at, i.created_at, s.name AS source_name
         FROM items i JOIN sources s ON s.id = i.source_id
         ${where} ORDER BY coalesce(i.published_at, i.created_at) DESC LIMIT 100`,
        args,
      ),
      /*
       * The diagram's arithmetic lives here. Aggregating source x collection
       * over the whole window means every count it prints is a property of the
       * population, not of however many rows we later draw.
       */
      getPool().query<NetworkPair>(
        `SELECT s.name AS source_name, s.url AS source_url,
                coalesce(i.stream, 'unclassified') AS collection,
                count(*)::int AS n,
                count(*) FILTER (WHERE ${OPEN_OPPORTUNITY_SQL})::int AS opportunities
         FROM items i JOIN sources s ON s.id = i.source_id
         WHERE i.relevant
           AND coalesce(i.published_at, i.created_at) >= now() - interval '30 days'
         GROUP BY s.name, s.url, coalesce(i.stream, 'unclassified')`,
      ),
      /* One mark per signal in the band. The ceiling is well clear of current
       * volume; if it is ever reached the band under-draws rather than lying. */
      getPool().query<NetworkSignal>(
        `SELECT i.id, i.title, i.url, i.stream, i.opportunity,
                i.published_at, i.created_at, s.name AS source_name
         FROM items i JOIN sources s ON s.id = i.source_id
         WHERE i.relevant
           AND coalesce(i.published_at, i.created_at) >= now() - interval '30 days'
         ORDER BY coalesce(i.published_at, i.created_at) DESC LIMIT 2000`,
      ),
      getPool().query<RadarRow>(
        `SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream, i.opportunity, i.opportunity_reason,
                i.published_at, i.created_at, s.name AS source_name
         FROM items i JOIN sources s ON s.id = i.source_id
         WHERE i.relevant
           AND coalesce(i.published_at, i.created_at) >= now() - interval '30 days'
         ORDER BY coalesce(i.published_at, i.created_at) DESC LIMIT 3`,
      ),
      getStats(),
      getSourceStats(),
      getUpcomingDeadlines(5),
    ]);

  const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined);

  const linkFor = (params: Record<string, string | undefined>) => {
    const merged = { stream, q, opp, filtered, ...params };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join('&');
    return qs ? `/?${qs}` : '/';
  };

  const today = sydneyToday();
  const groups: Array<{ date: string; rows: typeof rows }> = [];
  for (const r of rows) {
    const date = sydneyDateOf(r.published_at ?? r.created_at);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.rows.push(r);
    else groups.push({ date, rows: [r] });
  }

  return (
    <>
      <section className="observatory-hero">
        <div className="container observatory-grid">
          <div className="observatory-copy reveal">
            <p className="observatory-eyebrow">The access to justice observatory</p>
            <h1>Monitor access to justice developments.</h1>
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
              <div><dd>{stats.opps}</dd><dt>opportunities</dt></div>
              <div><dd>{stats.tracked}</dd><dt>items tracked</dt></div>
              <div><dd>{sources.total}</dd><dt>sources monitored</dt></div>
            </dl>
          </div>

          <div className="observatory-visual reveal reveal-1">
            <SignalNetwork pairs={networkPairs} signals={networkSignals} />
          </div>
        </div>
      </section>

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

          <div className="filters reveal reveal-1">
        <Link
          href={linkFor({ stream: undefined })}
          className={!stream ? 'active' : ''}
          aria-current={!stream ? 'true' : undefined}
        >
          All
        </Link>
        {Object.entries(STREAMS).map(([key, label]) => (
          <Link
            key={key}
            href={linkFor({ stream: key })}
            className={stream === key ? 'active' : ''}
            aria-current={stream === key ? 'true' : undefined}
          >
            {label}
          </Link>
        ))}
        <Link
          href={linkFor({ opp: opp === '1' ? undefined : '1' })}
          className={opp === '1' ? 'active' : ''}
          aria-current={opp === '1' ? 'true' : undefined}
        >
          <Flag />
          Opportunities
        </Link>
        <Link
          href={linkFor({ filtered: filtered === '1' ? undefined : '1' })}
          className={filtered === '1' ? 'active' : ''}
          aria-current={filtered === '1' ? 'true' : undefined}
          title="Items the enrichment agent screened out as not radar material"
        >
          Screened out
        </Link>
        <form action="/#radar-feed" method="get" className="search">
          {stream ? <input type="hidden" name="stream" value={stream} /> : null}
          {opp === '1' ? <input type="hidden" name="opp" value="1" /> : null}
          {filtered === '1' ? <input type="hidden" name="filtered" value="1" /> : null}
          <Search />
          <label className="sr-only" htmlFor="feed-search">
            Search the radar
          </label>
          <input id="feed-search" name="q" placeholder="Search the radar" defaultValue={q ?? ''} />
        </form>
          </div>

          <div className="workspace">
        <div className="workspace-main">
          {rows.length === 0 ? (
            <div className="empty-state">
              <p className="section-title">Nothing matches</p>
              <p>Try clearing a filter, or wait for the next collection run.</p>
            </div>
          ) : null}

          {groups.map((g) => (
            <section className="day-group" key={g.date} aria-label={dayLabel(g.date, today)}>
              <h2 className="day-heading">
                {dayLabel(g.date, today)}
                <span className="day-count">{g.rows.length}</span>
              </h2>
              {g.rows.map((i) => {
                const href = safeHref(i.url);
                return (
                  <article className="item ink-rail" style={streamVars(i.stream)} key={i.id}>
                    <div className="item-meta">
                      <span className="badge">{i.stream ? STREAMS[i.stream] : 'Unclassified'}</span>
                    </div>
                    <div className="item-body">
                      <h3>
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
                      </h3>
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
              <p className={`signal ${sources.ok === sources.total ? 'signal-ok' : 'signal-warn'}`}>
                <span className="signal-dot" />
                {sources.ok === sources.total ? 'All sources reporting' : 'Some sources stale'}
              </p>
              <p className="rail-note">
                {sources.ok} of {sources.total} sources returned on their last run
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
