import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { headerStatus } from '../lib/health-data.ts';

const counts = (c) => ({ total: 0, ok: 0, overdue: 0, failed: 0, never: 0, ...c });
const NOW = new Date('2026-11-17T02:00:00Z');
const RECENT = '2026-11-16T20:00:00Z';

describe('header status', () => {
  it('all sources reporting reads "Sources reached"', () => {
    const s = headerStatus(counts({ total: 3, ok: 3 }), RECENT, NOW);
    assert.equal(s.state, 'ok');
    assert.equal(s.label, 'Sources reached');
    assert.equal(s.detail, 'All sources reporting');
  });

  it('every source failed counts the sources not reached and names the failures', () => {
    const s = headerStatus(counts({ total: 3, failed: 3 }), RECENT, NOW);
    assert.equal(s.state, 'warn');
    assert.equal(s.label, '3 of 3 sources not reached');
    assert.equal(s.detail, '3 sources failed');
  });

  it('failed, overdue and never-run sources all count as not reached', () => {
    const s = headerStatus(counts({ total: 34, ok: 31, failed: 1, overdue: 1, never: 1 }), RECENT, NOW);
    assert.equal(s.state, 'warn');
    assert.equal(s.label, '3 of 34 sources not reached');
  });

  it('a single active source is counted in the singular', () => {
    assert.equal(headerStatus(counts({ total: 1, failed: 1 }), RECENT, NOW).label, '1 of 1 source not reached');
  });

  it('no active sources is a warning that says so', () => {
    const s = headerStatus(counts({ total: 0 }), RECENT, NOW);
    assert.equal(s.state, 'warn');
    assert.equal(s.label, 'No active sources');
  });

  it('a last successful run older than 36 hours takes priority and gives its Sydney date', () => {
    const s = headerStatus(counts({ total: 3, ok: 3 }), '2026-11-11T19:31:00Z', NOW);
    assert.equal(s.state, 'warn');
    assert.equal(s.label, 'Last collected 12 Nov 2026');
  });

  it('a run exactly 36 hours old is not yet stale', () => {
    const s = headerStatus(counts({ total: 3, ok: 3 }), '2026-11-15T14:00:00Z', NOW);
    assert.equal(s.label, 'Sources reached');
  });

  it('sources that have never completed a run are not reported as stale', () => {
    const s = headerStatus(counts({ total: 2, never: 2 }), null, NOW);
    assert.equal(s.label, '2 of 2 sources not reached');
  });

  it('a database that cannot be read is unknown, never reached', () => {
    const s = headerStatus(null, null, NOW);
    assert.equal(s.state, 'unknown');
    assert.equal(s.label, 'Status unavailable');
  });

  it('no label is a bare status enum', () => {
    const labels = [
      headerStatus(counts({ total: 3, ok: 3 }), RECENT, NOW),
      headerStatus(counts({ total: 3, failed: 3 }), RECENT, NOW),
      headerStatus(null, null, NOW),
    ].map((s) => s.label);
    for (const label of labels) assert.doesNotMatch(label, /^(Live|Degraded|Unknown)$/);
  });

  it('the layout renders the mapped label, not a hard-coded one', () => {
    const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    assert.match(layout, /headerStatus\(/);
    assert.doesNotMatch(layout, /<span>Live<\/span>/);
  });
});
