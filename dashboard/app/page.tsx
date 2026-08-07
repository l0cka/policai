import Link from 'next/link';
import { getPool } from '../lib/db';
import DeadlineTeaser from './deadlines';
import { countdown, daysUntil, getUpcomingDeadlines, sydneyToday } from '../lib/deadline-data';

export const dynamic = 'force-dynamic';

const STREAMS: Record<string, string> = {
  news: 'News', law_reform: 'Law reform', funding: 'Funding', tech_justice: 'Tech & justice',
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

async function Briefing() {
  const [statsResult, nextDeadlines] = await Promise.all([
    getPool().query(
      `SELECT count(*) FILTER (WHERE coalesce(published_at, created_at) >= now() - interval '7 days') AS new_week,
              count(*) FILTER (WHERE opportunity) AS opps
       FROM items WHERE relevant`,
    ),
    getUpcomingDeadlines(1),
  ]);
  const today = sydneyToday();
  const stats = statsResult.rows[0];
  const next = nextDeadlines[0];
  return (
    <div className="briefing">
      <span className="briefing-date">
        {new Date().toLocaleDateString('en-AU', { ...SYDNEY_DATE, weekday: 'long', day: 'numeric', month: 'long' })}
      </span>
      <span><strong>{stats.new_week}</strong> new this week</span>
      <span className="sep">·</span>
      <span className="briefing-opp">⚑ <strong>{stats.opps}</strong> opportunities</span>
      {next ? (
        <>
          <span className="sep">·</span>
          <span className="briefing-ddl">
            next deadline{' '}
            <Link href="/deadlines">
              <strong>
                {new Date(`${next.date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </strong>{' '}
              ({countdown(daysUntil(next.date, today))})
            </Link>
          </span>
        </>
      ) : null}
    </div>
  );
}

export default async function Feed({ searchParams }: { searchParams: Promise<Search> }) {
  const { stream, q, opp, filtered } = await searchParams;
  const cond: string[] = [filtered === '1' ? 'NOT i.relevant' : 'i.relevant'];
  const args: unknown[] = [];
  if (stream && Object.prototype.hasOwnProperty.call(STREAMS, stream)) { args.push(stream); cond.push(`i.stream = $${args.length}`); }
  if (opp === '1') cond.push(`i.opportunity`);
  if (q) { args.push(q); cond.push(`i.search @@ websearch_to_tsquery('english', $${args.length})`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await getPool().query(
    `SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream, i.opportunity, i.opportunity_reason,
            i.published_at, i.created_at, s.name AS source_name
     FROM items i JOIN sources s ON s.id = i.source_id
     ${where} ORDER BY coalesce(i.published_at, i.created_at) DESC LIMIT 100`,
    args,
  );

  const safeHref = (u: string) => /^https?:\/\//i.test(u) ? u : undefined;

  const linkFor = (params: Record<string, string | undefined>) => {
    const merged = { stream, q, opp, filtered, ...params };
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
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

  let cardIndex = 0;
  return (
    <>
      <Briefing />
      <DeadlineTeaser />
      <div className="filters">
        <Link href={linkFor({ stream: undefined })} className={!stream ? 'active' : ''}>All</Link>
        {Object.entries(STREAMS).map(([key, label]) => (
          <Link key={key} href={linkFor({ stream: key })} className={stream === key ? 'active' : ''}>{label}</Link>
        ))}
        <Link href={linkFor({ opp: opp === '1' ? undefined : '1' })} className={opp === '1' ? 'active' : ''}>⚑ Opportunities</Link>
        <Link href={linkFor({ filtered: filtered === '1' ? undefined : '1' })} className={filtered === '1' ? 'active' : ''} title="Items the enrichment agent screened out as not radar material">Filtered</Link>
        <form action="/" method="get">
          {stream ? <input type="hidden" name="stream" value={stream} /> : null}
          {opp === '1' ? <input type="hidden" name="opp" value="1" /> : null}
          {filtered === '1' ? <input type="hidden" name="filtered" value="1" /> : null}
          <input name="q" placeholder="Search…" defaultValue={q ?? ''} />
        </form>
      </div>
      {rows.length === 0 ? <p className="empty-state">Nothing matches — try clearing a filter, or wait for the next ingest run.</p> : null}
      {groups.map((g) => (
        <section key={g.date} aria-label={dayLabel(g.date, today)}>
          <h2 className="day-heading">
            {dayLabel(g.date, today)}
            <span className="day-count">{g.rows.length}</span>
          </h2>
          {g.rows.map((i) => (
            <article className={`item${i.stream ? ` s-${i.stream}` : ''}`} style={{ '--n': cardIndex++ } as React.CSSProperties} key={i.id}>
              <span className="stream-pill">
                {i.stream ? STREAMS[i.stream] : 'unclassified'} <span className="pill-source">· {i.source_name}</span>
              </span>
              <h3><a href={safeHref(i.url)}>{i.title}</a></h3>
              {i.blurb ? <p>{i.blurb}</p> : i.excerpt ? <p>{i.excerpt}</p> : null}
              {i.opportunity ? <p className="flag">⚑ {i.opportunity_reason}</p> : null}
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
