import path from 'node:path';
import { cliRun, parseCliCommand, type CliValues } from '../src/lib/cli-args';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type { ReviewableRecord } from '../src/lib/coverage-report';
import {
  approveReconfirmBatch,
  entryRecord,
  proposeReconfirmation,
  RECONFIRM_BATCH_SIZE,
  RECONFIRM_DUE_WITHIN_DAYS,
  RECONFIRM_KINDS,
  reconfirmApprovalSubject,
  reconfirmBatchKind,
  ReconfirmError,
  reconfirmPasskeyDecision,
  type ReconfirmDecision,
  type ReconfirmKind,
  type ReconfirmLedger,
} from '../src/lib/register-reconfirm';
import { approvalPageUrl, readEditorPasskeys } from '../src/lib/editor-approval';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'reconfirmations.json');
const FRAMEWORK_FILE = path.join(DATA_DIR, 'dta-ai-policy-framework.json');

type StoredRecord = ReviewableRecord & { sourceUrl?: string; url?: string; status?: string };

const STORES: Record<
  ReconfirmKind,
  {
    file: string;
    sourceUrl: (record: StoredRecord) => string;
    excludeIds: (records: StoredRecord[]) => Promise<Set<string>>;
  }
> = {
  policy: {
    file: path.join(DATA_DIR, 'policies.json'),
    sourceUrl: (record) => record.sourceUrl!,
    excludeIds: async () => {
      const framework = await readJsonFile<{ relatedPolicyId?: string } | null>(FRAMEWORK_FILE, null);
      return new Set(framework?.relatedPolicyId ? [framework.relatedPolicyId] : []);
    },
  },
  timeline: {
    file: path.join(DATA_DIR, 'timeline.json'),
    sourceUrl: (record) => record.sourceUrl!,
    excludeIds: async () => new Set(),
  },
  development: {
    file: path.join(DATA_DIR, 'developments.json'),
    sourceUrl: (record) => record.url!,
    excludeIds: async (records) =>
      new Set(records.filter((record) => record.status === 'dismissed').map((record) => record.id)),
  },
};

const COMMANDS = {
  propose: {
    kind: { type: 'string', value: '<kind>', help: `${RECONFIRM_KINDS.join(', ')}; the default is policy` },
    'due-within': {
      type: 'string',
      value: '<days>',
      help: `records due within this many days; the default is ${RECONFIRM_DUE_WITHIN_DAYS}`,
    },
    'batch-size': { type: 'string', value: '<n>', help: `records per batch; the default is ${RECONFIRM_BATCH_SIZE}` },
    exclude: { type: 'string', value: '<id,id,...>', help: 'records to leave out' },
    'dry-run': { type: 'boolean', help: 'audit and print the batches; write nothing' },
  },
  approve: {
    batch: { type: 'string', value: '<id>', required: true, help: 'the batch to approve' },
    attestation: {
      type: 'string',
      value: '<card url>',
      help: 'the approval card; needed until an editor passkey is registered',
    },
    'approved-at': { type: 'string', value: '<ISO time>', help: 'with --attestation; the default is now' },
    'approved-by': { type: 'string', value: '<name>', help: 'with --attestation; the default is Daniel Alkurdi' },
  },
} as const;

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

function reconfirmKind(value = 'policy'): ReconfirmKind {
  if (!(RECONFIRM_KINDS as readonly string[]).includes(value))
    throw new Error(`--kind must be one of ${RECONFIRM_KINDS.join(', ')}`);
  return value as ReconfirmKind;
}

async function readLedger(): Promise<ReconfirmLedger> {
  return readJsonFile<ReconfirmLedger>(LEDGER_FILE, { batches: [] });
}

async function propose(options: CliValues<typeof COMMANDS.propose>) {
  const now = new Date();
  const dryRun = options['dry-run'];
  const kind = reconfirmKind(options.kind);
  const dueWithinDays = positiveInteger(options['due-within'], RECONFIRM_DUE_WITHIN_DAYS, 'due-within');
  const batchSize = positiveInteger(options['batch-size'], RECONFIRM_BATCH_SIZE, 'batch-size');
  const store = STORES[kind];

  const records = await readJsonFile<StoredRecord[]>(store.file, []);
  const ledger = await readLedger();
  const excludeIds = await store.excludeIds(records);
  for (const id of options.exclude?.split(',') ?? []) if (id.trim()) excludeIds.add(id.trim());

  const { candidates, records: audited, batches, fullReview } = await proposeReconfirmation(records, ledger, {
    kind,
    now,
    dueWithinDays,
    batchSize,
    excludeIds,
    sourceUrl: store.sourceUrl,
  });

  console.log(`reconfirm: ${candidates.length} ${kind} records due within ${dueWithinDays} days`);
  for (const batch of batches) {
    console.log(`\nBatch ${batch.id} (${batch.entries.length} unchanged ${kind} records)`);
    console.log(`  approve: ${approvalPageUrl(reconfirmApprovalSubject(batch))}`);
    for (const entry of batch.entries)
      console.log(`  ${entryRecord(entry)!.id}  verified ${entry.verifiedAt.slice(0, 10)}  ${entry.title}`);
  }
  if (fullReview.length > 0) {
    console.log(`\nFull review needed (${fullReview.length})`);
    for (const item of fullReview) console.log(`  ${item.id}  ${item.reason}`);
  }

  if (dryRun) {
    console.log('\nDry run: nothing written.');
    return;
  }
  await writeJsonFile(store.file, audited);
  await writeJsonFile(LEDGER_FILE, { batches: [...ledger.batches, ...batches] });
  console.log(`\nWrote audit evidence and ${batches.length} batch(es).`);
}

async function approve(options: CliValues<typeof COMMANDS.approve>) {
  const batchId = options.batch;
  const ledger = await readLedger();
  const batch = ledger.batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new ReconfirmError([`unknown batch ${batchId}`]);
  const kind = reconfirmBatchKind(batch);
  if (!kind) throw new ReconfirmError([`batch ${batchId} does not name records of one kind`]);

  const passkeys = await readEditorPasskeys();
  let decision: ReconfirmDecision;
  if (passkeys.length > 0) {
    decision = await reconfirmPasskeyDecision(batch, passkeys);
  } else {
    const attestationUrl = options.attestation;
    if (!attestationUrl) throw new Error('approve needs --attestation until an editor passkey is registered');
    decision = {
      approvedBy: options['approved-by'] ?? 'Daniel Alkurdi',
      approvedAt: options['approved-at'] ?? new Date().toISOString(),
      attestationUrl,
    };
  }

  const { file } = STORES[kind];
  const records = await readJsonFile<StoredRecord[]>(file, []);
  const result = approveReconfirmBatch(records, ledger, batchId, decision);
  await writeJsonFile(file, result.records);
  await writeJsonFile(LEDGER_FILE, result.ledger);
  console.log(
    `reconfirm: batch ${batchId} approved by ${decision.approvedBy}, ${batch.entries.length} ${kind} records renewed.`,
  );
}

async function main() {
  const cli = cliRun(parseCliCommand('npm run reconfirm:register --', COMMANDS, process.argv.slice(2)));
  if (cli.command === 'propose') await withDataMutationLock(() => propose(cli.values));
  else await withDataMutationLock(() => approve(cli.values));
}

main().catch((error) => {
  console.error(error instanceof ReconfirmError ? error.message : error);
  process.exitCode = 1;
});
