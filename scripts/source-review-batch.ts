/**
 * Approve several staged source reviews on one editor passkey signature.
 *
 * Usage:
 *   npm run source-review:batch -- propose --ids=<id,id,...> [--batch-size=10]
 *   npm run source-review:batch -- approve --batch=<id>
 *
 * `propose` pins each review to its current proposal (every one must have no
 * blockers), writes the batches to data/source-review-batches.json and prints
 * each batch's approve link with what the editor must see. `approve` reads
 * the editor's signature from the approvals mailbox and publishes every
 * review in the batch; rerunning it resumes a partial run.
 */

import path from 'node:path';
import { readJsonFile } from '../src/lib/file-store';
import type { SourceReviewBatchLedger } from '../src/lib/source-review-batch';
import {
  handleProposeSourceReviewBatch,
  handleRecordDecision,
} from '../src/mcp/tool-handlers';

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function propose(args: string[]) {
  const ids = (flag(args, 'ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const size = flag(args, 'batch-size');
  const batches = await handleProposeSourceReviewBatch({
    ids,
    batchSize: size ? Number(size) : undefined,
  });
  for (const batch of batches) {
    console.log(`\nBatch ${batch.id}: ${batch.proposals.length} proposal(s)`);
    console.log(`Approve: ${batch.approvalUrl}`);
    for (const proposal of batch.proposals) {
      const record = proposal.proposed as { date?: string; title?: string } | undefined;
      console.log(
        `- ${proposal.id} (${proposal.proposalCode}) ${record?.date ?? ''} ${record?.title ?? proposal.title}\n  ${proposal.sourceUrl}`,
      );
    }
  }
}

async function approve(args: string[]) {
  const batchId = flag(args, 'batch');
  if (!batchId) throw new Error('--batch=<id> is required');
  const ledger = await readJsonFile<SourceReviewBatchLedger>(
    path.join(process.cwd(), 'data', 'source-review-batches.json'),
    { batches: [] },
  );
  const batch = ledger.batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new Error(`Unknown batch ${batchId}`);
  for (const entry of batch.entries) {
    const review = await handleRecordDecision({ ...entry, batchId });
    console.log(`${entry.id}: ${review.status}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'propose') return propose(args);
  if (command === 'approve') return approve(args);
  console.error('Usage: source-review-batch propose --ids=<id,...> | approve --batch=<id>');
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
