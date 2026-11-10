import { closePool, getPool } from './lib/db.js';
import { fetchItemPage, type PageText } from './lib/page-text.js';
import { mapWithConcurrency } from './lib/page-title.js';

export type UnenrichedItem = {
  id: number;
  title: string;
  url: string;
  excerpt: string | null;
  published_at: string | null;
  source_name: string;
  stream_hint: string | null;
};

/* Below this, the excerpt is too thin to classify from and the page is read. */
const THIN_EXCERPT_CHARS = 300;

/**
 * The batch for the enrichment agent, with each thin item's page attached.
 * The worker fetches the pages through its public-address guard so the agent
 * needs no fetch tool. `page` is null when the excerpt was enough or the page
 * could not be read.
 */
export async function withPages(
  items: UnenrichedItem[],
  fetchPage: (url: string) => Promise<PageText | null> = fetchItemPage,
): Promise<(UnenrichedItem & { page: PageText | null })[]> {
  return mapWithConcurrency(items, 4, async (item) => ({
    ...item,
    page: (item.excerpt ?? '').trim().length >= THIN_EXCERPT_CHARS ? null : await fetchPage(item.url),
  }));
}

async function main() {
  const pool = getPool();
  const { rows } = await pool.query<UnenrichedItem>(
    `SELECT i.id, i.title, i.url, i.excerpt, i.published_at, s.name AS source_name, s.stream_hint
     FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.enriched_at IS NULL
     ORDER BY i.created_at ASC
     LIMIT 40`,
  );
  await closePool();
  console.log(JSON.stringify(await withPages(rows), null, 2));
}

if (process.argv[1]?.endsWith('list-unenriched.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
