import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_ENV, claimDigest, decideDigestAction, digestExists, releaseDigest,
} from '../src/lib/digest-gate.js';

const approved = { [APPROVAL_ENV]: 'yes' };

describe('decideDigestAction', () => {
  const cases: Array<[string, string[], Record<string, string>, boolean, string]> = [
    ['no flags', [], {}, false, 'dry-run'],
    ['no flags, approved env', [], approved, false, 'dry-run'],
    ['no flags, already sent', [], approved, true, 'dry-run'],
    ['--dry-run', ['--dry-run'], approved, false, 'dry-run'],
    ['--send with --dry-run', ['--send', '--dry-run'], approved, false, 'dry-run'],
    ['--send without approval', ['--send'], {}, false, 'refuse-not-approved'],
    ['--send with approval set to no', ['--send'], { [APPROVAL_ENV]: 'no' }, false, 'refuse-not-approved'],
    ['--send with approval set to true', ['--send'], { [APPROVAL_ENV]: 'true' }, false, 'refuse-not-approved'],
    ['--send approved, period already sent', ['--send'], approved, true, 'refuse-already-sent'],
    ['--send unapproved, period already sent', ['--send'], {}, true, 'refuse-not-approved'],
    ['--send approved, fresh period', ['--send'], approved, false, 'send'],
  ];
  it.each(cases)('%s', (_name, argv, env, alreadySent, expected) => {
    expect(decideDigestAction({ argv, env, alreadySent })).toBe(expected);
  });

  it('does not treat SMTP credentials as approval', () => {
    const env = { SMTP_USER: 'u', SMTP_PASS: 'p', DIGEST_TO: 't@example.test' };
    expect(decideDigestAction({ argv: [], env, alreadySent: false })).toBe('dry-run');
    expect(decideDigestAction({ argv: ['--send'], env, alreadySent: false })).toBe('refuse-not-approved');
  });
});

type Call = { sql: string; values?: unknown[] };

function mockPool(existingRows: Array<{ id: number }>, insertedId = 7) {
  const calls: Call[] = [];
  const query = async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (/FROM digests/i.test(sql)) return { rows: existingRows };
    if (/INSERT INTO digests/i.test(sql)) return { rows: [{ id: insertedId }] };
    return { rows: [] };
  };
  const released: boolean[] = [];
  const pool = {
    query,
    connect: async () => ({ query, release: () => { released.push(true); } }),
  } as unknown as Pool;
  return { pool, calls, released };
}

const start = new Date('2026-10-09T00:00:00Z');
const end = new Date('2026-10-16T00:00:00Z');

describe('digest period idempotency', () => {
  it('reports an existing row for the period', async () => {
    const { pool, calls } = mockPool([{ id: 1 }]);
    expect(await digestExists(pool, end)).toBe(true);
    expect(calls[0].values).toEqual([end.toISOString()]);
  });

  it('reports no row for a fresh period', async () => {
    const { pool } = mockPool([]);
    expect(await digestExists(pool, end)).toBe(false);
  });

  it('refuses to claim a period that already has a row, inserting nothing', async () => {
    const { pool, calls, released } = mockPool([{ id: 1 }]);
    expect(await claimDigest(pool, start, end, [1, 2])).toBeNull();
    expect(calls.some((c) => /INSERT/i.test(c.sql))).toBe(false);
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(released).toEqual([true]);
  });

  it('claims a fresh period under an advisory lock in one transaction', async () => {
    const { pool, calls, released } = mockPool([], 42);
    expect(await claimDigest(pool, start, end, [1, 2])).toBe(42);
    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toMatch(/pg_advisory_xact_lock/);
    expect(sqls.findIndex((s) => /FROM digests/i.test(s))).toBeLessThan(sqls.findIndex((s) => /INSERT/i.test(s)));
    expect(sqls.at(-1)).toBe('COMMIT');
    const insert = calls.find((c) => /INSERT/i.test(c.sql));
    expect(insert?.values).toEqual([start.toISOString(), end.toISOString(), [1, 2]]);
    expect(released).toEqual([true]);
  });

  it('rolls back and rethrows when the claim fails', async () => {
    const calls: string[] = [];
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          calls.push(sql);
          if (/INSERT/i.test(sql)) throw new Error('db down');
          return { rows: [] };
        },
        release: () => {},
      }),
    } as unknown as Pool;
    await expect(claimDigest(pool, start, end, [])).rejects.toThrow('db down');
    expect(calls.at(-1)).toBe('ROLLBACK');
  });

  it('releases a claim by id', async () => {
    const { pool, calls } = mockPool([]);
    await releaseDigest(pool, 42);
    expect(calls[0].sql).toMatch(/DELETE FROM digests/i);
    expect(calls[0].values).toEqual([42]);
  });
});
