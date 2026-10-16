import type { Pool } from 'pg';

const MAX_REASON_LENGTH = 500;

export async function recordRejectedEnrichment(pool: Pool, itemId: number, reason: string): Promise<void> {
  const summary = reason.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
  await pool.query(
    `UPDATE items SET relevant = false, opportunity = false, blurb = $2, enriched_at = now()
     WHERE id = $1 AND enriched_at IS NULL`,
    [itemId, `Enrichment rejected: ${summary}`],
  );
}
