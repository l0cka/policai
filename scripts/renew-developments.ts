/**
 * Renew the promoted developments of a record from a signed review that was
 * published before the publication renewal rule covered them.
 *
 * Usage:
 *   npm run renew:developments -- --review=<source review id> [--dry-run]
 *
 * The review must be published with a passkey signature, and its record must
 * still carry that review's verification. The renewal is the one publication
 * makes (`developmentsRenewedByPublication`), and validate:data accepts it.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { renewalsForPublishedReview } from '../src/lib/development-renewal';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type { Development, Policy, SourceReview, TimelineEvent } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'source-reviews.json');
const DEVELOPMENTS_FILE = path.join(DATA_DIR, 'developments.json');
const RECORD_FILES = {
  policy: path.join(DATA_DIR, 'policies.json'),
  timeline_event: path.join(DATA_DIR, 'timeline.json'),
} as const;

async function main() {
  const args = process.argv.slice(2);
  const reviewId = args.find((arg) => arg.startsWith('--review='))?.slice('--review='.length);
  if (!reviewId) throw new Error('usage: renew-developments --review=<id> [--dry-run]');

  await withDataMutationLock(async () => {
    const reviews = await readJsonFile<SourceReview[]>(REVIEWS_FILE, []);
    const review = reviews.find((candidate) => candidate.id === reviewId);
    if (!review) throw new Error(`unknown review ${reviewId}`);
    if (review.entryKind !== 'policy' && review.entryKind !== 'timeline_event')
      throw new Error(`${reviewId} publishes a ${review.entryKind}`);
    const recordId = (review.proposedRecord as { id?: string } | undefined)?.id;
    const records = await readJsonFile<(Policy | TimelineEvent)[]>(RECORD_FILES[review.entryKind], []);
    const developments = await readJsonFile<Development[]>(DEVELOPMENTS_FILE, []);

    const updates = renewalsForPublishedReview({
      review,
      record: records.find((record) => record.id === recordId),
      developments,
      reviews,
    });
    if (!updates)
      throw new Error(
        `${reviewId} is not a signed, published review whose record ${recordId} still carries its verification`,
      );
    for (const { id, changes } of updates)
      console.log(`renew ${id} -> ${changes.url} (verified ${changes.verification.checkedAt})`);
    if (updates.length === 0) console.log(`No development of ${recordId} is due a renewal from ${reviewId}.`);
    if (args.includes('--dry-run') || updates.length === 0) return;

    const changesById = new Map(updates.map((update) => [update.id, update.changes]));
    await writeJsonFile(
      DEVELOPMENTS_FILE,
      developments.map((development) => ({ ...development, ...changesById.get(development.id) })),
    );
    console.log(`Renewed ${updates.length} development(s).`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
