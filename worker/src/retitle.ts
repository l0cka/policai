/*
 * Backfill for items whose title was derived from their URL slug before
 * `resolveSlugTitles` existed. Fetches each item's own page and replaces the
 * slug title with the real headline.
 *
 *   docker compose --profile worker run --rm worker src/retitle.ts --dry-run
 *   docker compose --profile worker run --rm worker src/retitle.ts --limit 200
 *
 * Safe to re-run: an item whose stored title no longer matches its slug is no
 * longer a candidate, so a repaired title is never touched again.
 */
import { closePool, getPool } from './lib/db.js';
import { titleFromSlug } from './lib/fetch-firecrawl.js';
import { fetchPageTitle, mapWithConcurrency } from './lib/page-title.js';

type Row = { id: number; url: string; title: string };

/*
 * A title is slug-derived when re-deriving it from the URL reproduces it.
 * That is an exact test, so it cannot mistake a publisher's own lowercase
 * headline for slug damage.
 *
 * The loose comparison exists for one narrow case: titles written before the
 * acronym restore landed ("Un arbitrary detention" where today's derivation
 * yields "UN arbitrary detention"). Comparing on letters alone still requires
 * every word to match, so it stays a same-slug test, not a similarity test.
 */
export function isSlugDerived(url: string, title: string): boolean {
  let derived: string;
  try {
    derived = titleFromSlug(new URL(url));
  } catch {
    return false;
  }
  if (!derived) return false;
  if (derived === title) return true;
  const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return flatten(derived) === flatten(title);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg >= 0 ? Number.parseInt(args[limitArg + 1] ?? '', 10) : Number.NaN;

  const pool = getPool();
  const { rows } = await pool.query<Row>(
    `SELECT i.id, i.url, i.title
       FROM items i JOIN sources s ON s.id = i.source_id
      WHERE s.active
      ORDER BY i.id`,
  );

  let candidates = rows.filter((r) => isSlugDerived(r.url, r.title));
  if (Number.isFinite(limit) && limit > 0) candidates = candidates.slice(0, limit);
  console.error(`${rows.length} items, ${candidates.length} slug-derived`);

  let replaced = 0;
  let unreachable = 0;
  let unchanged = 0;

  await mapWithConcurrency(candidates, 4, async (row) => {
    const real = await fetchPageTitle(row.url);
    if (!real) {
      unreachable += 1;
      return;
    }
    if (real === row.title) {
      unchanged += 1;
      return;
    }
    console.log(JSON.stringify({ id: row.id, from: row.title, to: real }));
    if (!dryRun) {
      await pool.query(`UPDATE items SET title = $2 WHERE id = $1`, [row.id, real]);
    }
    replaced += 1;
  });

  console.error(
    JSON.stringify({
      dry_run: dryRun,
      candidates: candidates.length,
      replaced,
      unchanged,
      unreachable,
    }),
  );
  await closePool();
}

const isDirectRun = process.argv[1]?.endsWith('retitle.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
