import { getPool } from '../../lib/db';
import { CheckCircle, CircleAlert, CircleDash } from '../icons';

export const dynamic = 'force-dynamic';

function StatusCell({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="status status-none">
        <CircleDash />
        Never run
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="status status-failed">
        <CircleAlert />
        Failed
      </span>
    );
  }
  return (
    <span className="status status-ok">
      <CheckCircle />
      {status}
    </span>
  );
}

export default async function Health() {
  const { rows } = await getPool().query(
    `SELECT DISTINCT ON (s.id) s.name, s.fetch_method, r.status, r.items_found, r.items_new, r.error, r.created_at
     FROM sources s LEFT JOIN ingest_runs r ON r.source_id = s.id
     WHERE s.active
     ORDER BY s.id, r.created_at DESC NULLS LAST`,
  );

  const failed = rows.filter((r) => r.status === 'failed').length;
  const never = rows.filter((r) => !r.status).length;
  const ok = rows.length - failed - never;

  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">Collection</p>
        <h1 className="page-title">Source health</h1>
        <p className="page-intro">
          The most recent collection run for every active source. A source that fails keeps its last
          error so the cause is visible without opening the logs.
        </p>
      </header>

      <dl className="stat-strip reveal reveal-1">
        <div className="stat">
          <dd>{rows.length}</dd>
          <dt>active sources</dt>
        </div>
        <div className="stat">
          <dd>{ok}</dd>
          <dt>reporting</dt>
        </div>
        <div className="stat stat-flag">
          <dd>{failed}</dd>
          <dt>failed</dt>
        </div>
        <div className="stat">
          <dd>{never}</dd>
          <dt>never run</dt>
        </div>
      </dl>

      <p className="table-scroll-hint">Scroll horizontally to view all columns.</p>
      <div
        className="table-wrap reveal reveal-2"
        role="region"
        aria-label="Source health table"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">Most recent collection run for each active source</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Method</th>
              <th scope="col">Last run</th>
              <th scope="col">Status</th>
              <th scope="col">Found</th>
              <th scope="col">New</th>
              <th scope="col">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="cell-mono">{r.fetch_method}</td>
                <td className="cell-mono">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleString('en-AU', {
                        timeZone: 'Australia/Sydney',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })
                    : '—'}
                </td>
                <td>
                  <StatusCell status={r.status ?? null} />
                </td>
                <td className="cell-mono">{r.items_found ?? '—'}</td>
                <td className="cell-mono">{r.items_new ?? '—'}</td>
                <td className="cell-error">{r.error ? r.error.slice(0, 160) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
