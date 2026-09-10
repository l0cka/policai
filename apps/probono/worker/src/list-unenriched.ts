import { closePool, getPool } from './lib/db.js';

async function main() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.url, i.excerpt, i.published_at, s.name AS source_name, s.stream_hint
     FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.enriched_at IS NULL
     ORDER BY i.created_at ASC
     LIMIT 40`,
  );
  console.log(JSON.stringify(rows, null, 2));
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
