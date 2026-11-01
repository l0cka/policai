import { createHash } from 'node:crypto';
import { approvalSubject } from '@/lib/approval-subject';

/**
 * Several staged source reviews approved on one editor passkey signature.
 *
 * Each entry pins a review to the exact proposal the editor was shown, so
 * the signature covers every proposal in the batch and nothing else. Each
 * review is still decided and published on its own, and keeps a copy of the
 * batch so its signature can be checked without the ledger.
 */

export const SOURCE_REVIEW_BATCH_SIZE = 10;
export const SOURCE_REVIEW_BATCH_PROPOSED_BY = 'Claude (agent)';

export interface SourceReviewBatchEntry {
  id: string;
  proposalHash: string;
}

export interface SourceReviewBatchRef {
  id: string;
  entries: SourceReviewBatchEntry[];
}

export interface SourceReviewBatch extends SourceReviewBatchRef {
  proposedAt: string;
  proposedBy: string;
}

export interface SourceReviewBatchLedger {
  batches: SourceReviewBatch[];
}

export function sourceReviewBatchSubject(batch: SourceReviewBatchRef): string {
  return approvalSubject({
    kind: 'source-review-batch',
    batchId: batch.id,
    entriesHash: createHash('sha256').update(JSON.stringify(batch.entries)).digest('hex'),
  });
}

export function batchCovers(batch: SourceReviewBatchRef, entry: SourceReviewBatchEntry): boolean {
  return batch.entries.some(
    (candidate) => candidate.id === entry.id && candidate.proposalHash === entry.proposalHash,
  );
}

/** Splits entries into new batches with ids `<day>-<n>` unused in the ledger. */
export function planSourceReviewBatches(
  entries: readonly SourceReviewBatchEntry[],
  ledger: SourceReviewBatchLedger,
  { now, batchSize = SOURCE_REVIEW_BATCH_SIZE }: { now: Date; batchSize?: number },
): SourceReviewBatch[] {
  const day = now.toISOString().slice(0, 10);
  const taken = new Set(ledger.batches.map((batch) => batch.id));
  let sequence = 1;
  const batches: SourceReviewBatch[] = [];
  for (let start = 0; start < entries.length; start += batchSize) {
    while (taken.has(`${day}-${sequence}`)) sequence += 1;
    const id = `${day}-${sequence}`;
    taken.add(id);
    batches.push({
      id,
      proposedAt: now.toISOString(),
      proposedBy: SOURCE_REVIEW_BATCH_PROPOSED_BY,
      entries: entries.slice(start, start + batchSize),
    });
  }
  return batches;
}
