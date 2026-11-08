/**
 * Renew the promoted developments of a record from a signed review that was
 * published before the publication renewal rule covered them.
 *
 * Usage:
 *   npm run renew:developments -- --review=<source review id>
 *       [--previous-from=<git ref>] [--dry-run]
 *
 * Without --previous-from, only developments the record was promoted from are
 * renewed. --previous-from names a commit from before the publication (for a
 * squash-merged publication, its parent); the record there must hash to the
 * revision the review was staged against. Developments verified from that
 * revision's evidence are then renewed too, and move with the record to its
 * new page.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { renewalsForPublishedReview } from '../src/lib/development-renewal';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type { Development, Policy, SourceReview, TimelineEvent } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILES = {
  reviews: 'data/source-reviews.json',
  developments: 'data/developments.json',
  policy: 'data/policies.json',
  timeline_event: 'data/timeline.json',
} as const;

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function recordsAt(ref: string, file: string): (Policy | TimelineEvent)[] {
  return JSON.parse(execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
}

async function main() {
  const args = process.argv.slice(2);
  const reviewId = flag(args, 'review');
  if (!reviewId) throw new Error('usage: renew-developments --review=<id> [--previous-from=<git ref>] [--dry-run]');
  const previousFrom = flag(args, 'previous-from');
  const file = (name: string) => path.join(DATA_DIR, path.basename(name));

  await withDataMutationLock(async () => {
    const reviews = await readJsonFile<SourceReview[]>(file(FILES.reviews), []);
    const review = reviews.find((candidate) => candidate.id === reviewId);
    if (!review) throw new Error(`unknown review ${reviewId}`);
    if (review.entryKind !== 'policy' && review.entryKind !== 'timeline_event')
      throw new Error(`${reviewId} publishes a ${review.entryKind}`);
    const recordFile = FILES[review.entryKind];
    const recordId = (review.proposedRecord as { id?: string } | undefined)?.id;
    const records = await readJsonFile<(Policy | TimelineEvent)[]>(file(recordFile), []);
    const developments = await readJsonFile<Development[]>(file(FILES.developments), []);

    const previousRecord = previousFrom
      ? recordsAt(previousFrom, recordFile).find((record) => record.id === recordId)
      : undefined;
    if (previousFrom && !previousRecord) throw new Error(`${recordId} is not in ${recordFile} at ${previousFrom}`);

    const { updates, problems } = renewalsForPublishedReview({
      review,
      record: records.find((record) => record.id === recordId),
      previousRecord,
      developments,
      reviews,
    });
    if (problems.length > 0) throw new Error(`Cannot renew from ${reviewId}:\n- ${problems.join('\n- ')}`);

    for (const { id, changes } of updates)
      console.log(`renew ${id} -> ${changes.url} (verified ${changes.verification.checkedAt})`);
    if (updates.length === 0) console.log(`No development of ${recordId} is due a renewal from ${reviewId}.`);
    if (args.includes('--dry-run') || updates.length === 0) return;

    const changesById = new Map(updates.map((update) => [update.id, update.changes]));
    await writeJsonFile(
      file(FILES.developments),
      developments.map((development) => ({ ...development, ...changesById.get(development.id) })),
    );
    console.log(`Renewed ${updates.length} development(s).`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
