import { closePool, getPool } from './lib/db.js';
import { EnrichmentSchema } from './lib/types.js';

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
  const parsed = EnrichmentSchema.safeParse(JSON.parse(await readStdin()));
  if (!parsed.success) {
    console.error(`validation failed: ${parsed.error.message}`);
    process.exit(2);
  }
  const e = parsed.data;
  const pool = getPool();
  const res = await pool.query(
    `UPDATE items SET stream = $2, blurb = $3, opportunity = $4, opportunity_reason = $5,
       entities = $6, excerpt = COALESCE($7, excerpt), enriched_at = now()
     WHERE id = $1`,
    [itemId, e.stream, e.blurb, e.opportunity, e.opportunity_reason, JSON.stringify(e.entities), e.excerpt],
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
