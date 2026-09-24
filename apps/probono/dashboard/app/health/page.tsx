import type { Metadata } from 'next';
import { getPool } from '../../lib/db';
import { getItemCompleteness, getSourceHealth, sourceHealthState, ITEM_EXPECTED_FIELDS, ITEM_EXPECTED_FIELD_LABELS, type SourceHealthState } from '../../lib/health-data';
import { CheckCircle, CircleAlert, CircleDash } from '../icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Source health',
  description: 'The most recent collection run for every active Policai A2J source, with overdue, failures and their last error.',
};

function StatusCell({ state }: { state: SourceHealthState }) {
  if (state === 'never') {
    return (
      <span className="status status-none">
        <CircleDash />
        Never run
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="status status-failed">
        <CircleAlert />
        Failed
      </span>
    );
  }
  if (state === 'overdue') {
    return (
      <span className="status status-overdue">
        <CircleAlert />
        Overdue
      </span>
    );
  }
  return (
    <span className="status status-ok">
      <CheckCircle />
      OK
    </span>
  );
}

/** Field label first, missing count last: a ledger of gaps, not a chart. */
function CompletenessRow({ field, missing }: { field: string; missing: number }) {
  return (
    <div className="completeness-row">
      <dt>{field}</dt>
      <dd className="cell-mono">{missing === 0 ? 'All present' : `${missing} missing`}</dd>
    </div>
  );
}

export default async function Health() {
  const pool = getPool();
  const [rows, completeness] = await Promise.all([getSourceHealth(pool), getItemCompleteness(pool)]);
  const failed = rows.filter((r) => sourceHealthState(r) === 'failed').length;
  const never = rows.filter((r) => sourceHealthState(r) === 'never').length;
  const overdue = rows.filter((r) => sourceHealthState(r) === 'overdue').length;
  const ok = rows.length - failed - never - overdue;

  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">Collection</p>
        <h1 className="page-title">Source health</h1>
        <p className="page-intro">
          The most recent collection run for every active source. Failures are listed first, and a
          source that fails keeps its last error so the cause is visible without opening the logs. A
          source with no successful run for more than three days counts as overdue; the collector
          runs daily, so one missed run stays within the limit.
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
          <dd>{overdue}</dd>
          <dt>overdue</dt>
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
            {rows.map((r) => {
              const state = sourceHealthState(r);
              return (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td className="cell-mono">{r.fetch_method}</td>
                  <td className="cell-mono">
                    {r.next_run_at
                      ? new Date(r.next_run_at).toLocaleString('en-AU', {
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
                    <StatusCell state={state} />
                  </td>
                  <td className="cell-mono">{r.items_found ?? '—'}</td>
                  <td className="cell-mono">{r.items_new ?? '—'}</td>
                  <td className="cell-error">{r.error ? r.error.slice(0, 160) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="completeness reveal reveal-3" aria-labelledby="completeness-heading">
        <h2 id="completeness-heading" className="section-title">Record completeness</h2>
        <p className="page-intro">
          {completeness.total} relevant{' '}
          {completeness.total === 1 ? 'record' : 'records'} collected. Counts below are
          computed by the database, so each field is measured against the same set. This
          measures the records that exist, not how much of the sector the radar covers.
        </p>
        <dl className="completeness-list">
          {ITEM_EXPECTED_FIELDS.map((field) => (
            <CompletenessRow
              key={field}
              field={ITEM_EXPECTED_FIELD_LABELS[field]}
              missing={completeness.missing[`missing_${field}`]}
            />
          ))}
        </dl>
      </section>
    </div>
  );
}