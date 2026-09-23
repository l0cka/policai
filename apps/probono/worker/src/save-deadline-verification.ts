import { z } from 'zod';
import { closePool, getPool } from './lib/db.js';
import { applyVerification, mergeVerification, storedList } from './lib/deadline-verify.js';

/*
 * Write one verification back into items.entities. Stdin carries
 * {"model": "...", "output": {"verdicts": [...]}} from verify-deadlines.ts.
 * The verdicts are untrusted: they are re-applied here to the item's current
 * deadlines, and only verdicts that pass the save-time deadline rules replace
 * a stored date. The update is a single JSONB write under a row lock; no
 * schema change.
 */

const InputSchema = z.object({
  model: z.string().min(1).max(100),
  output: z.unknown(),
});

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const itemId = Number(process.argv[2]);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    console.error('usage: tsx src/save-deadline-verification.ts <item_id>  (JSON verification on stdin)');
    process.exit(2);
  }
  let input: z.infer<typeof InputSchema>;
  try {
    const parsed = InputSchema.safeParse(JSON.parse(await readStdin()));
    if (!parsed.success) throw new Error(parsed.error.message);
    input = parsed.data;
  } catch (err) {
    console.error(`malformed verification: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ entities: Record<string, unknown> | null }>(
      'SELECT entities FROM items WHERE id = $1 FOR UPDATE',
      [itemId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      console.error(`no item with id ${itemId}`);
      process.exit(2);
    }
    const entities = rows[0].entities ?? {};
    const result = applyVerification(storedList(entities.deadlines), input.output);
    for (const note of result.notes) console.error(`item ${itemId}: ${note}`);
    for (const o of result.outcomes) {
      if (o.action === 'rejected') console.error(`item ${itemId}: kept ${o.stored.date}; verdict rejected: ${o.reason}`);
    }
    const next = mergeVerification(entities, result, input.model);
    await client.query('UPDATE items SET entities = $2 WHERE id = $1', [itemId, JSON.stringify(next)]);
    await client.query('COMMIT');
    const summary = result.outcomes.map((o) => `${o.stored.date}:${o.action}${o.result.status ? `/${o.result.status}` : ''}`).join(' ');
    console.log(`verified item ${itemId}: ${summary}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
