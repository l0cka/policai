// Source-health and completeness logic for the five pattern ports. Pure parts
// are unit-tested here; the SQL itself runs against the disposable PGlite
// fixture in test/health.integration.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_HEALTH_SQL,
  SOURCE_OVERDUE_DAYS,
  sourceHealthState,
  sourceHealthLabel,
  summarizeSourceHealth,
  fetchMethodLabel,
} from '../lib/health-data.ts';
import { statusPayload, statusUnavailable } from '../lib/status-payload.ts';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-09-24T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function row(overrides = {}) {
  return {
    id: 1,
    name: 'Fixture source',
    fetch_method: 'rss',
    active: true,
    last_status: 'ok',
    last_ok_at: hoursAgo(2),
    next_run_at: hoursAgo(2),
    items_found: 3,
    items_new: 1,
    error: null,
    ...overrides,
  };
}

describe('source overdue threshold (P1)', () => {
  it('marks a source overdue only after three days without a successful run', () => {
    assert.equal(sourceHealthState(row({ last_ok_at: hoursAgo(3 * 24 - 2) }), NOW), 'ok');
    assert.equal(sourceHealthState(row({ last_ok_at: hoursAgo(3 * 24 + 2) }), NOW), 'overdue');
    assert.equal(SOURCE_OVERDUE_DAYS, 3);
  });

  it('keeps a failed latest run ahead of overdue even with an older ok run', () => {
    const failed = row({ last_status: 'failed', last_ok_at: hoursAgo(6 * 24) });
    assert.equal(sourceHealthState(failed, NOW), 'failed');
  });

  it('counts a source that has never run as never, not overdue', () => {
    assert.equal(sourceHealthState(row({ last_status: null, last_ok_at: null }), NOW), 'never');
  });

  it('ignores inactive sources entirely', () => {
    assert.equal(sourceHealthState(row({ active: false }), NOW), 'never');
  });

  it('orders failures, never-run, overdue and reporting, then by name', () => {
    const rows = [
      row({ id: 1, name: 'Beta', last_ok_at: hoursAgo(2) }),
      row({ id: 2, name: 'Alpha', last_status: 'failed', last_ok_at: hoursAgo(2) }),
      row({ id: 3, name: 'Zulu', last_ok_at: hoursAgo(8 * 24) }),
      row({ id: 4, name: 'Delta', last_status: null, last_ok_at: null }),
    ];
    const summary = summarizeSourceHealth(rows, NOW);
    assert.deepEqual(
      { total: summary.total, ok: summary.ok, overdue: summary.overdue, failed: summary.failed, never: summary.never },
      { total: 4, ok: 1, overdue: 1, failed: 1, never: 1 },
    );
    assert.equal(summary.reporting, summary.ok);
    assert.equal(sourceHealthLabel('overdue'), 'Overdue');
  });

  it('selects one latest run per source and computes the last ok run in SQL', () => {
    // The shared SQL must stay a per-source latest run plus a last-ok lookup,
    // so /health and /api/status read the same population.
    assert.match(SOURCE_HEALTH_SQL, /LEFT JOIN LATERAL/);
    assert.match(SOURCE_HEALTH_SQL, /ORDER BY r3\.created_at DESC LIMIT 1/);
    assert.match(SOURCE_HEALTH_SQL, /r2\.status = 'ok'/);
    assert.doesNotMatch(SOURCE_HEALTH_SQL, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
  });
});

describe('fetch method label', () => {
  it('describes the retrieval kind, not the tool', () => {
    assert.equal(fetchMethodLabel('rss'), 'Feed');
    assert.equal(fetchMethodLabel('firecrawl'), 'Web page');
    assert.equal(fetchMethodLabel('unknown'), 'Other');
  });
});

describe('api/status payload (P5)', () => {
  it('reports an empty population honestly and degrades to a 503 body', () => {
    const payload = statusPayload({ total: 0, ok: 0, overdue: 0, failed: 0, never: 0 }, 3, null);
    assert.equal(payload.lastHealthyAt, null);
    assert.equal(payload.sources.total, 0);
    assert.deepEqual(statusUnavailable(), {
      payload: { success: false, error: 'Source health is unavailable.' },
      status: 503,
    });
  });
});

describe('record completeness framing (P2)', () => {
  it('measures every expected field over the same relevant-item population', async () => {
    // The SQL is a single statement: one scan of relevant items, one
    // count(*) FILTER per expected field, no per-field second query.
    const { getItemCompleteness, ITEM_EXPECTED_FIELDS } = await import('../lib/health-data.ts');
    assert.deepEqual([...ITEM_EXPECTED_FIELDS], ['stream', 'blurb', 'excerpt', 'published_at', 'deadlines']);
    const source = getItemCompleteness.toString();
    for (const field of ITEM_EXPECTED_FIELDS) {
      assert.match(source, new RegExp(`missing_${field}`), `counts ${field}`);
    }
    assert.match(source, /count\(\*\) FILTER/i);
    assert.match(source, /WHERE i\.relevant/);
    assert.doesNotMatch(source, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
  });
});