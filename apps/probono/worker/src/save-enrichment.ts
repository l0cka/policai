import { closePool, getPool } from './lib/db.js';
import { recordRejectedEnrichment } from './lib/reject-enrichment.js';
import { prepareEnrichment } from './lib/types.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const itemId = Number(process.argv[2]);
  if (!Number.isInteger(itemId)) {
    console.error('usage: tsx src/save-enrichment.ts <item_id>  (JSON Enrichment on stdin)');
    process.exit(2);
  }
  const reject = async (reason: string): Promise<never> => {
    console.error(`item ${itemId}: ${reason}`);
    await recordRejectedEnrichment(getPool(), itemId, reason);
    await closePool();
    process.exit(2);
  };
  let data: unknown;
  try {
    data = JSON.parse(await readStdin());
  } catch (err) {
    return reject(`malformed JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const prepared = prepareEnrichment(data);
  if (!prepared.ok) return reject(`validation failed: ${prepared.error}`);
  // Invalid dates are dropped, not fatal: the rest of the item still lands.
  for (const d of prepared.dropped) {
    console.error(`item ${itemId}: dropped deadline ${JSON.stringify(d.deadline)}: ${d.reason}`);
  }
  for (const note of prepared.notes) console.error(`item ${itemId}: ${note}`);
  const e = prepared.enrichment;
  const pool = getPool();
  const res = await pool.query(
    `UPDATE items SET stream = $2, relevant = $3, blurb = $4, opportunity = $5, opportunity_reason = $6,
       entities = $7, excerpt = COALESCE($8, excerpt), enriched_at = now()
     WHERE id = $1`,
    [itemId, e.stream, e.relevant, e.blurb, e.opportunity, e.opportunity_reason, JSON.stringify(e.entities), e.excerpt],
  );
  if (res.rowCount === 0) {
    console.error(`no item with id ${itemId}`);
    process.exit(2);
  }
  console.log(`saved enrichment for item ${itemId}`);
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
