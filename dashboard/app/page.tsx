import Link from 'next/link';
import { getPool } from '../lib/db';
import DeadlineTeaser from './deadlines';

export const dynamic = 'force-dynamic';

const STREAMS: Record<string, string> = {
  news: 'News', law_reform: 'Law reform', funding: 'Funding', tech_justice: 'Tech & justice',
};

type Search = { stream?: string; q?: string; opp?: string; filtered?: string };

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

  return (
    <>
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
      <DeadlineTeaser />
      {rows.length === 0 ? <p>No items yet. The next ingest run will populate the feed.</p> : null}
      {rows.map((i) => (
        <article className="item" key={i.id}>
          <span className="stream-pill">{i.stream ? STREAMS[i.stream] : 'unclassified'} · {i.source_name}</span>
          <h3><a href={safeHref(i.url)}>{i.title}</a></h3>
          {i.blurb ? <p>{i.blurb}</p> : i.excerpt ? <p>{i.excerpt}</p> : null}
          {i.opportunity ? <p className="flag">⚑ {i.opportunity_reason}</p> : null}
          <p className="meta">
            {new Date(i.published_at ?? i.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </article>
      ))}
    </>
  );
}
