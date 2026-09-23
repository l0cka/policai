import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePool, getPool } from './lib/db.js';
import { selectItemsToVerify, type VerifyCandidate } from './lib/deadline-verify.js';

/*
 * Items whose deadlines are due a verification pass, as JSON on stdout.
 * The SQL narrows to relevant items carrying a date in the window; the rules
 * (day-precision actions, staleness, the T-7 re-check) live in
 * selectItemsToVerify, where they are unit-tested.
 */
export const CANDIDATES_SQL = `
  SELECT i.id, i.title, i.url, i.entities->'deadlines' AS deadlines,
         i.entities->>'deadlines_verified_at' AS verified_at
  FROM items i
  WHERE i.relevant
    AND jsonb_typeof(i.entities->'deadlines') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.entities->'deadlines') d
      WHERE d->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND d->>'date' >= to_char((now() AT TIME ZONE 'Australia/Sydney') - interval '30 days', 'YYYY-MM-DD'))
  ORDER BY i.id`;

export async function listDeadlinesToVerify(limit: number) {
  const { rows } = await getPool().query<VerifyCandidate>(CANDIDATES_SQL);
  return selectItemsToVerify(rows, new Date(), { limit });
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const limit = Math.min(50, Math.max(1, Number(process.env.VERIFY_BATCH ?? 25) || 25));
  listDeadlinesToVerify(limit)
    .then(async (items) => {
      console.log(JSON.stringify(items, null, 2));
      await closePool();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
