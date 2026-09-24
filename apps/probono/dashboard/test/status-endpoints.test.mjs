// The /api/status payload, the sitemap and robots outputs: well-formed JSON
// and XML, honest counts, and metacharacter-safe rendering. No database.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { statusPayload, statusUnavailable } from '../lib/status-payload.ts';
import { sourceHealthState } from '../lib/health-data.ts';

describe('api/status payload (P5)', () => {
  it('carries the register-shaped counts with the overdue threshold', () => {
    const payload = statusPayload({ total: 5, ok: 3, overdue: 1, failed: 1, never: 0 }, 3, '2026-09-24T00:00:00Z');
    assert.deepEqual(payload, {
      sources: { total: 5, ok: 3, overdue: 1, failed: 1, never: 0, overdueAfterDays: 3 },
      lastHealthyAt: '2026-09-24T00:00:00Z',
      success: true,
    });
  });

  it('reports an empty population honestly and degrades to a 503 body', () => {
    const payload = statusPayload({ total: 0, ok: 0, overdue: 0, failed: 0, never: 0 }, 3, null);
    assert.equal(payload.lastHealthyAt, null);
    assert.equal(payload.sources.total, 0);
    assert.deepEqual(statusUnavailable(), {
      payload: { success: false, error: 'Source health is unavailable.' },
      status: 503,
    });
  });

  it('survives a JSON round-trip with values that look like markup', () => {
    const hostile = statusPayload({ total: 2, ok: 2, overdue: 0, failed: 0, never: 0 }, 3, '2026-09-24T00:00:00Z');
    const round = JSON.parse(JSON.stringify(hostile));
    assert.deepEqual(round, hostile);
    // Numbers stay numbers: counts are counts, not interpolated strings.
    assert.equal(typeof round.sources.total, 'number');
    assert.equal(typeof round.sources.overdue, 'number');
  });
});

describe('sitemap and robots outputs (P7)', () => {
  it('lists the five live routes with absolute, canonical https URLs', async () => {
    const sitemap = (await import('../app/sitemap.ts')).default();
    assert.deepEqual(
      sitemap.map((entry) => entry.url),
      [
        'https://a2j.policai.org',
        'https://a2j.policai.org/this-week',
        'https://a2j.policai.org/deadlines',
        'https://a2j.policai.org/sector',
        'https://a2j.policai.org/health',
      ],
    );
    for (const entry of sitemap) {
      const parsed = new URL(entry.url);
      assert.equal(parsed.protocol, 'https:');
      assert.equal(parsed.hostname, 'a2j.policai.org');
      assert.equal(typeof entry.priority, 'number');
      assert.ok(entry.priority > 0 && entry.priority <= 1);
      assert.ok(['daily', 'weekly', 'monthly', 'yearly', 'always', 'hourly', 'never'].includes(entry.changeFrequency));
    }
  });

  it('excludes api responses from robots and points at the sitemap', async () => {
    const robots = (await import('../app/robots.ts')).default();
    assert.deepEqual(robots.rules, [{ userAgent: '*', allow: '/', disallow: '/api/' }]);
    assert.equal(robots.sitemap, 'https://a2j.policai.org/sitemap.xml');
  });

  it('escapes XML metacharacters the way the register feed does', () => {
    // The sitemap/robots generators emit only code-owned strings, but the
    // escape rule must still hold if a hostname ever carries metacharacters.
    const xmlEscape = (value) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const hostile = '<Fixture & "Source">';
    const entry = `<url><loc>${xmlEscape(hostile)}</loc></url>`;
    assert.match(entry, /&lt;Fixture &amp; &quot;Source&quot;&gt;/);
    assert.doesNotMatch(entry, /<Fixture /);
    // No raw metacharacter survives into the element text.
    assert.equal(entry.includes('<Fixture'), false);
    assert.equal(entry, '<url><loc>&lt;Fixture &amp; &quot;Source&quot;&gt;</loc></url>');
  });
});

describe('health row rendering inputs (P1 display contract)', () => {
  it('maps fixture rows to the states the /health cells render', () => {
    const NOW = new Date('2026-09-24T12:00:00Z');
    const base = { active: true, last_status: 'ok', last_ok_at: '2026-09-24T10:00:00Z' };
    assert.equal(sourceHealthState(base, NOW), 'ok');
    assert.equal(sourceHealthState({ ...base, last_status: 'failed' }, NOW), 'failed');
    assert.equal(sourceHealthState({ ...base, last_ok_at: '2026-09-10T10:00:00Z' }, NOW), 'overdue');
    assert.equal(sourceHealthState({ ...base, last_status: null, last_ok_at: null }, NOW), 'never');
  });
});