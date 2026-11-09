/**
 * Re-confirm editorially verified records whose official source is unchanged
 * since an editor last verified them, one editor approval per batch. Register
 * policies, timeline events and developments each have their own batches.
 *
 * Usage:
 *   npm run reconfirm:register -- propose [--kind=policy|timeline|development]
 *       [--due-within=30] [--batch-size=10] [--exclude=<id>,<id>] [--dry-run]
 *   npm run reconfirm:register -- approve --batch=<id>
 *
 * Once an editor passkey is registered, `approve` takes the editor's passkey
 * signature over the batch from the approvals mailbox; `propose` prints the
 * page where the editor signs. Before then it takes
 * --attestation=<card url> [--approved-at=<ISO>] [--approved-by="Daniel Alkurdi"].
 *
 * `propose` audits every record of the kind (default policy) due within the
 * window (it needs network access to the official sources, so run it on
 * Argus), writes the audit evidence to that kind's data file, and appends
 * batches of unchanged records to data/reconfirmations.json. Changed or
 * unreadable sources are listed for a full review instead. --exclude leaves
 * out records another piece of work is already re-verifying.
 *
 * `approve` needs no network beyond the approvals mailbox. It reads the kind
 * from the batch and renews its records only if every fingerprint still
 * matches and every audit is at most seven days old.
 */

import path from 'node:path';
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

/** A record as stored in its data file; written back with every field kept. */
type StoredRecord = ReviewableRecord & { sourceUrl?: string; url?: string; status?: string };

const STORES: Record<
  ReconfirmKind,
  {
    file: string;
    sourceUrl: (record: StoredRecord) => string;
    /** Records that are never batched. */
    excludeIds: (records: StoredRecord[]) => Promise<Set<string>>;
  }
> = {
  policy: {
    file: path.join(DATA_DIR, 'policies.json'),
    sourceUrl: (record) => record.sourceUrl!,
    // The DTA framework artifact must not predate its policy's verification,
    // so that record is re-verified together with the artifact, never in a batch.
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
    // A dismissed development is not public, so it has nothing to renew.
    excludeIds: async (records) =>
      new Set(records.filter((record) => record.status === 'dismissed').map((record) => record.id)),
  },
};

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

function kindFlag(args: string[]): ReconfirmKind {
  const value = flag(args, 'kind') ?? 'policy';
  if (!(RECONFIRM_KINDS as readonly string[]).includes(value))
    throw new Error(`--kind must be one of ${RECONFIRM_KINDS.join(', ')}`);
  return value as ReconfirmKind;
}

async function readLedger(): Promise<ReconfirmLedger> {
  return readJsonFile<ReconfirmLedger>(LEDGER_FILE, { batches: [] });
}

async function propose(args: string[]) {
  const now = new Date();
  const dryRun = args.includes('--dry-run');
  const kind = kindFlag(args);
  const dueWithinDays = positiveInteger(flag(args, 'due-within'), RECONFIRM_DUE_WITHIN_DAYS, 'due-within');
  const batchSize = positiveInteger(flag(args, 'batch-size'), RECONFIRM_BATCH_SIZE, 'batch-size');
  const store = STORES[kind];

  const records = await readJsonFile<StoredRecord[]>(store.file, []);
  const ledger = await readLedger();
  const excludeIds = await store.excludeIds(records);
  for (const id of flag(args, 'exclude')?.split(',') ?? []) if (id.trim()) excludeIds.add(id.trim());

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

async function approve(args: string[]) {
  const batchId = flag(args, 'batch');
  if (!batchId) throw new Error('approve needs --batch');
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
    const attestationUrl = flag(args, 'attestation');
    if (!attestationUrl) throw new Error('approve needs --attestation until an editor passkey is registered');
    decision = {
      approvedBy: flag(args, 'approved-by') ?? 'Daniel Alkurdi',
      approvedAt: flag(args, 'approved-at') ?? new Date().toISOString(),
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
  const [command, ...args] = process.argv.slice(2);
  if (command === 'propose') await withDataMutationLock(() => propose(args));
  else if (command === 'approve') await withDataMutationLock(() => approve(args));
  else throw new Error('usage: reconfirm-register propose|approve [options]');
}

main().catch((error) => {
  console.error(error instanceof ReconfirmError ? error.message : error);
  process.exitCode = 1;
});
