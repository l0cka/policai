import Link from 'next/link';
import { STREAMS, radarHref, type RadarState, type radarPage } from '../lib/radar-state';
import { ArrowRight, Flag, Search } from './icons';

export function RadarControls({ state }: { state: RadarState }) {
  const filtered = Boolean(state.q || state.stream || state.opp || state.filtered);
  return (
    <div className="radar-controls">
      <form action="/#radar-feed" method="get" className="radar-search" role="search" aria-label="Search radar results">
        {state.stream ? <input type="hidden" name="stream" value={state.stream} /> : null}
        {state.opp ? <input type="hidden" name="opp" value="1" /> : null}
        {state.filtered ? <input type="hidden" name="filtered" value="1" /> : null}
        <label htmlFor="feed-search">Search signals, sources or topics</label>
        <div className="radar-search-row">
          <input key={state.q ?? ''} id="feed-search" type="search" name="q" maxLength={300} placeholder="For example, legal assistance or a source name" defaultValue={state.q ?? ''} />
          <button type="submit" className="button-primary"><Search /> Search</button>
        </div>
      </form>
      <nav className="filters" aria-label="Radar filters">
        <Link href={radarHref(state, { stream: undefined })} className={!state.stream ? 'active' : ''} aria-current={!state.stream ? 'true' : undefined}>All</Link>
        {Object.entries(STREAMS).map(([key, label]) => (
          <Link key={key} href={radarHref(state, { stream: key })} className={state.stream === key ? 'active' : ''} aria-current={state.stream === key ? 'true' : undefined}>{label}</Link>
        ))}
        <Link href={radarHref(state, { opp: state.opp ? undefined : '1' })} className={state.opp ? 'active' : ''} aria-current={state.opp ? 'true' : undefined}><Flag /> Opportunities</Link>
        <Link href={radarHref(state, { filtered: state.filtered ? undefined : '1' })} className={state.filtered ? 'active' : ''} aria-current={state.filtered ? 'true' : undefined} title="Items the enrichment agent screened out as not radar material">Screened out</Link>
      </nav>
      {filtered ? <div className="radar-context">
        <p>{state.filtered ? 'Screened-out items' : 'Relevant signals'}{state.stream ? ` · ${STREAMS[state.stream]}` : ''}{state.opp ? ' · Open opportunities' : ''}{state.q ? ` · “${state.q}”` : ''}</p>
        <Link href="/#radar-feed">Clear search and filters</Link>
      </div> : null}
    </div>
  );
}

export function RadarPagination({ state, pagination, position = 'top' }: {
  state: RadarState;
  pagination: ReturnType<typeof radarPage>;
  position?: 'top' | 'bottom';
}) {
  const { page, pages, first, last, total } = pagination;
  if (position === 'bottom' && pages === 1) return null;
  return (
    <div className="radar-pagination">
      <p>{total ? `${first}–${last} of ${total} signals` : '0 signals'}{pages > 1 ? ` · Page ${page} of ${pages}` : ''}</p>
      {pages > 1 ? <nav aria-label={`Radar pages (${position})`}>
        {page > 1 ? <Link href={radarHref(state, { page: page - 1 })}>Newer</Link> : <span aria-disabled="true">Newer</span>}
        {page < pages ? <Link href={radarHref(state, { page: page + 1 })}>Older <ArrowRight /></Link> : <span aria-disabled="true">Older</span>}
      </nav> : null}
    </div>
  );
}
