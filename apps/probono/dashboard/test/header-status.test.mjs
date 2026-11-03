// The masthead dot must not say "Live" unless collection is healthy, and a
// collector that cannot be read is unknown rather than live.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { headerStatus } from '../lib/health-data.ts';

const counts = (c) => ({ total: 0, ok: 0, overdue: 0, failed: 0, never: 0, ...c });

describe('header status', () => {
  it('all sources reporting is live', () => {
    const s = headerStatus(counts({ total: 3, ok: 3 }));
    assert.equal(s.state, 'ok');
    assert.equal(s.label, 'Live');
  });

  it('every source failed is degraded and names the failures', () => {
    const s = headerStatus(counts({ total: 3, failed: 3 }));
    assert.equal(s.state, 'warn');
    assert.equal(s.label, 'Degraded');
    assert.equal(s.detail, '3 sources failed');
  });

  it('one overdue source is degraded', () => {
    assert.equal(headerStatus(counts({ total: 3, ok: 2, overdue: 1 })).state, 'warn');
  });

  it('no active sources is degraded, not live', () => {
    assert.equal(headerStatus(counts({ total: 0 })).state, 'warn');
  });

  it('a database that cannot be read is unknown, not live', () => {
    const s = headerStatus(null);
    assert.equal(s.state, 'unknown');
    assert.notEqual(s.label, 'Live');
  });

  it('the layout renders the mapped label, not a hard-coded one', () => {
    const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    assert.match(layout, /headerStatus\(/);
    assert.doesNotMatch(layout, /<span>Live<\/span>/);
  });
});
