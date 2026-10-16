import type { Pool } from 'pg';

export const APPROVAL_ENV = 'PROBONO_DIGEST_SEND_APPROVED';

export type DigestAction = 'dry-run' | 'refuse-not-approved' | 'refuse-already-sent' | 'send';

const SAME_PERIOD = `date_trunc('week', period_end AT TIME ZONE 'Australia/Sydney')
  = date_trunc('week', $1::timestamptz AT TIME ZONE 'Australia/Sydney')`;

export function decideDigestAction(input: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  alreadySent: boolean;
}): DigestAction {
  const { argv, env, alreadySent } = input;
  if (!argv.includes('--send') || argv.includes('--dry-run')) return 'dry-run';
  if (env[APPROVAL_ENV] !== 'yes') return 'refuse-not-approved';
  if (alreadySent) return 'refuse-already-sent';
  return 'send';
}

export async function digestExists(pool: Pool, periodEnd: Date): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM digests WHERE ${SAME_PERIOD} LIMIT 1`,
    [periodEnd.toISOString()],
  );
  return rows.length > 0;
}

export async function claimDigest(
  pool: Pool, periodStart: Date, periodEnd: Date, itemIds: number[],
): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('probono-digest'))`);
    const { rows: existing } = await client.query(
      `SELECT id FROM digests WHERE ${SAME_PERIOD} LIMIT 1`,
      [periodEnd.toISOString()],
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const { rows } = await client.query(
      `INSERT INTO digests (period_start, period_end, item_ids) VALUES ($1, $2, $3) RETURNING id`,
      [periodStart.toISOString(), periodEnd.toISOString(), itemIds],
    );
    await client.query('COMMIT');
    return rows[0].id as number;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function releaseDigest(pool: Pool, id: number): Promise<void> {
  await pool.query(`DELETE FROM digests WHERE id = $1`, [id]);
}
