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

      <div className="stat-strip reveal reveal-1">
        <span className="stat">
          <b>{rows.length}</b>
          <span>active sources</span>
        </span>
        <span className="stat">
          <b>{ok}</b>
          <span>reporting</span>
        </span>
        <span className="stat stat-flag">
          <b>{failed}</b>
          <span>failed</span>
        </span>
        <span className="stat">
          <b>{never}</b>
          <span>never run</span>
        </span>
      </div>

      <div className="table-wrap reveal reveal-2">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Method</th>
              <th>Last run</th>
              <th>Status</th>
              <th>Found</th>
              <th>New</th>
              <th>Error</th>
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
