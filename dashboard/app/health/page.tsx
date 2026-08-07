import { getPool } from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function Health() {
  const { rows } = await getPool().query(
    `SELECT DISTINCT ON (s.id) s.name, s.fetch_method, r.status, r.items_found, r.items_new, r.error, r.created_at
     FROM sources s LEFT JOIN ingest_runs r ON r.source_id = s.id
     WHERE s.active
     ORDER BY s.id, r.created_at DESC NULLS LAST`,
  );
  return (
    <>
      <h2>Source health</h2>
      <div className="health-card">
      <table>
        <thead><tr><th>Source</th><th>Method</th><th>Last run</th><th>Status</th><th>Found</th><th>New</th><th>Error</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.fetch_method}</td>
              <td>{r.created_at ? new Date(r.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'never'}</td>
              <td className={r.status === 'failed' ? 'status-failed' : 'status-ok'}>{r.status ?? '—'}</td>
              <td>{r.items_found ?? '—'}</td>
              <td>{r.items_new ?? '—'}</td>
              <td>{r.error ? r.error.slice(0, 120) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
