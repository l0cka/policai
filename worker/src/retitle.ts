/*
 * Backfill for items whose title was derived from their URL slug before
 * `resolveSlugTitles` existed. Fetches each item's own page and replaces the
 * slug title with the real headline.
 *
 *   docker compose --profile worker run --rm worker src/retitle.ts --dry-run
 *   docker compose --profile worker run --rm worker src/retitle.ts --limit 200
 *   docker compose --profile worker run --rm worker src/retitle.ts --no-firecrawl
 *
 * Safe to re-run: an item whose stored title no longer matches its slug is no
 * longer a candidate, so a repaired title is never touched again.
 */
import { closePool, getPool } from './lib/db.js';
import { countRepeats, slugTitleVariants } from './lib/fetch-firecrawl.js';
import { fetchPageTitle, mapWithConcurrency } from './lib/page-title.js';

type Row = { id: number; url: string; title: string };

/*
 * A title is slug-derived when re-deriving it from the URL reproduces it
 * exactly, in any shape that derivation has ever produced.
 *
 * The comparison must stay case-sensitive. Case is the whole signal: a
 * publisher's own headline capitalises its proper nouns, and a slug title
 * cannot. Comparing on letters alone — which an earlier draft of this did —
 * makes "Federal Budget misses opportunity…" indistinguishable from the slug
 * that was built out of it, and offers up an undamaged title for replacement.
 */
export function isSlugDerived(url: string, title: string): boolean {
  let segment: string;
  try {
    segment = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slugTitleVariants(new URL(url)).includes(title)) return false;
  } catch {
    return false;
  }
  /*
   * Some sites keep case in their URLs, so their "slug" is the headline
   * already — "/Brisbane-Ekka-Show-Day-closures-…" derives back to a title
   * with nothing missing from it. An uppercase letter in the segment is proof
   * that case was never flattened, and so nothing here needs repairing.
   */
  return segment === segment.toLowerCase();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  // The scraper is on by default here: the backfill exists to close this gap,
  // and the sites still holding slug titles are exactly the ones a plain GET
  // cannot read. `--no-firecrawl` runs the cheap pass alone.
  const firecrawl = !args.includes('--no-firecrawl');
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

  /*
   * Read every page first, decide afterwards. The check that a title is not
   * proposed for two different items can only be made once they have all
   * arrived — and it is the check that catches a site whose article pages
   * answer with the organisation's name.
   */
  const proposed = await mapWithConcurrency(candidates, firecrawl ? 2 : 4, (row) =>
    fetchPageTitle(row.url, { firecrawl }),
  );
  const repeated = countRepeats(proposed);

  let replaced = 0;
  let unreachable = 0;
  let unchanged = 0;
  let furniture = 0;
  // Which sites we could not read a title from. Reported rather than swallowed:
  // a site behind a bot check keeps its slug titles indefinitely, and that
  // should be visible as a known gap, not look like nothing needed doing.
  const unreadable = new Map<string, number>();

  for (const [index, row] of candidates.entries()) {
    const real = proposed[index];
    if (!real) {
      unreachable += 1;
      const host = URL.canParse(row.url) ? new URL(row.url).hostname : row.url;
      unreadable.set(host, (unreadable.get(host) ?? 0) + 1);
      continue;
    }
    if (real === row.title) {
      unchanged += 1;
      continue;
    }
    if (repeated.has(real)) {
      console.error(JSON.stringify({ id: row.id, furniture: real }));
      furniture += 1;
      continue;
    }
    console.log(JSON.stringify({ id: row.id, from: row.title, to: real }));
    if (!dryRun) {
      await pool.query(`UPDATE items SET title = $2 WHERE id = $1`, [row.id, real]);
    }
    replaced += 1;
  }

  console.error(
    JSON.stringify({
      dry_run: dryRun,
      firecrawl,
      candidates: candidates.length,
      replaced,
      unchanged,
      furniture,
      unreachable,
      unreadable_hosts: Object.fromEntries(
        [...unreadable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      ),
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
