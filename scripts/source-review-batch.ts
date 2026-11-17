import path from 'node:path';
import { cliRun, parseCliCommand, type CliValues } from '../src/lib/cli-args';
import { readJsonFile } from '../src/lib/file-store';
import { SOURCE_REVIEW_BATCH_SIZE, type SourceReviewBatchLedger } from '../src/lib/source-review-batch';
import {
  handleProposeSourceReviewBatch,
  handleRecordDecision,
} from '../src/mcp/tool-handlers';

const COMMANDS = {
  propose: {
    ids: { type: 'string', value: '<id,id,...>', required: true, help: 'the staged reviews to batch' },
    'batch-size': { type: 'string', value: '<n>', help: `reviews per batch; the default is ${SOURCE_REVIEW_BATCH_SIZE}` },
  },
  approve: {
    batch: { type: 'string', value: '<id>', required: true, help: 'the batch the editor signed' },
  },
} as const;

async function propose(options: CliValues<typeof COMMANDS.propose>) {
  const ids = options.ids.split(',').map((id) => id.trim()).filter(Boolean);
  const size = options['batch-size'];
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

async function approve({ batch: batchId }: CliValues<typeof COMMANDS.approve>) {
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
  const cli = cliRun(parseCliCommand('npm run source-review:batch --', COMMANDS, process.argv.slice(2)));
  if (cli.command === 'propose') return propose(cli.values);
  return approve(cli.values);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
