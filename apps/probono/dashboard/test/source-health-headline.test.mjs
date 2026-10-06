// The landing-page "Collection status" label must name what is true: failed,
// overdue and never-run sources are separate states (see sourceHealthState),
// and retired sources stay out of every count.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceHealthHeadline, summarizeSourceHealth } from '../lib/health-data.ts';

const counts = (c) => ({ total: 0, ok: 0, overdue: 0, failed: 0, never: 0, ...c });
const NOW = new Date('2026-09-24T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('source health headline', () => {
  it('0 overdue + 1 failed says failed, never overdue', () => {
    const h = sourceHealthHeadline(counts({ total: 3, ok: 2, failed: 1 }));
    assert.equal(h.label, '1 source failed');
    assert.equal(h.tone, 'warn');
    assert.doesNotMatch(`${h.label} ${h.note}`, /overdue/i);
    assert.equal(h.note, '2 of 3 active sources reporting');
  });

  it('0 failed + 2 overdue says overdue', () => {
    const h = sourceHealthHeadline(counts({ total: 4, ok: 2, overdue: 2 }));
    assert.equal(h.label, '2 sources overdue');
    assert.equal(h.tone, 'warn');
    assert.doesNotMatch(h.label, /failed|never/i);
    assert.match(h.note, /2 of 4 active sources reporting/);
    assert.match(h.note, /no successful run in 3 days/);
  });

  it('never-run only says never run', () => {
    const h = sourceHealthHeadline(counts({ total: 3, never: 3 }));
    assert.equal(h.label, '3 sources never run');
    assert.equal(h.tone, 'warn');
    assert.doesNotMatch(h.label, /overdue|failed/i);
    assert.equal(h.note, '0 of 3 active sources reporting');
  });

  it('all reporting says so', () => {
    const h = sourceHealthHeadline(counts({ total: 3, ok: 3 }));
    assert.equal(h.label, 'All sources reporting');
    assert.equal(h.tone, 'ok');
    assert.equal(h.note, '3 of 3 active sources returned on their last run');
  });

  it('all retired is not "all reporting"', () => {
    const rows = [
      { active: false, last_status: 'ok', last_ok_at: hoursAgo(2) },
      { active: false, last_status: 'failed', last_ok_at: null },
    ];
    const summary = summarizeSourceHealth(rows, NOW);
    assert.equal(summary.total, 0);
    const h = sourceHealthHeadline(summary);
    assert.equal(h.label, 'No active sources');
    assert.equal(h.tone, 'warn');
    assert.equal(h.note, 'No active sources are configured for collection');
  });

  it('names every bad state, worst first, in one combined label', () => {
    const h = sourceHealthHeadline(counts({ total: 7, ok: 1, failed: 2, overdue: 1, never: 3 }));
    assert.equal(h.label, '2 sources failed, 1 overdue, 3 never run');
    assert.match(h.note, /^1 of 7 active sources reporting/);
  });

  it('falls back to a plain label when no state is counted', () => {
    // Defensive: ok < total with no failed, overdue or never-run count
    // should not happen, but must not claim a state that is not true.
    const h = sourceHealthHeadline(counts({ total: 3, ok: 2 }));
    assert.equal(h.label, 'Some sources not reporting');
    assert.equal(h.tone, 'warn');
    assert.equal(h.note, '2 of 3 active sources reporting');
  });

  it('is what the landing page renders, not a local overdue guess', () => {
    const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    assert.match(page, /sourceHealthHeadline\(/);
    assert.doesNotMatch(page, /Some sources overdue|Some sources stale/);
  });
});
