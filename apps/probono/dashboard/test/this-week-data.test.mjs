import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKLY_ANCHOR_SQL, WEEKLY_DEVELOPMENTS_SQL } from '../lib/weekly-query.ts';

process.env.DATABASE_URL ??= 'postgres://fixture/none';

function fakePool(anchor) {
  const developmentsParams = [];
  return {
    developmentsParams,
    async query(sql, params) {
      if (sql === WEEKLY_ANCHOR_SQL) return { rows: [{ anchor }] };
      if (sql === WEEKLY_DEVELOPMENTS_SQL) {
        developmentsParams.push(params);
        return { rows: [] };
      }
      return { rows: /count\(\*\)::int AS total/.test(sql) ? [{ total: 0 }] : [] };
    },
  };
}

describe('getWeeklyBrief window', () => {
  it('selects developments in the 168 hours ending at the collection anchor', async () => {
    const { getWeeklyBrief } = await import('../lib/this-week-data.ts');
    const anchor = new Date('2026-10-01T03:00:00Z');
    const pool = fakePool(anchor);
    globalThis.pgPool = pool;
    const brief = await getWeeklyBrief(new Date('2026-10-20T00:00:00Z'));
    assert.deepEqual(pool.developmentsParams, [[anchor.toISOString()]]);
    assert.equal(brief.anchor.getTime(), anchor.getTime());
  });

  it('falls back to the wall clock when no run has succeeded', async () => {
    const { getWeeklyBrief } = await import('../lib/this-week-data.ts');
    const asOf = new Date('2026-10-20T00:00:00Z');
    const pool = fakePool(null);
    globalThis.pgPool = pool;
    const brief = await getWeeklyBrief(asOf);
    assert.deepEqual(pool.developmentsParams, [[asOf.toISOString()]]);
    assert.equal(brief.anchor, null);
  });
});
