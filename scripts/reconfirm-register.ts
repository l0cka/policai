/**
 * Re-confirm register records whose official source is unchanged since an
 * editor last verified them, one editor approval per batch.
 *
 * Usage:
 *   npm run reconfirm:register -- propose [--due-within=30] [--batch-size=10] [--dry-run]
 *   npm run reconfirm:register -- approve --batch=<id>
 *
 * Once an editor passkey is registered, `approve` takes the editor's passkey
 * signature over the batch from the approvals mailbox; `propose` prints the
 * page where the editor signs. Before then it takes
 * --attestation=<card url> [--approved-at=<ISO>] [--approved-by="Daniel Alkurdi"].
 *
 * `propose` audits every record due within the window (it needs network
 * access to the official sources, so run it on Argus), writes the audit
 * evidence to data/policies.json, and appends batches of unchanged records to
 * data/reconfirmations.json. Changed or unreadable sources are listed for a
 * full review instead.
 *
 * `approve` needs no network. It renews the batch's records only if every
 * fingerprint still matches and every audit is at most seven days old.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import {
  applyRegisterAuditEvidence,
  auditRegister,
  registerAuditRetrievalOptions,
} from '../src/lib/register-audit';
import {
  approveReconfirmBatch,
  proposeReconfirmBatches,
  RECONFIRM_BATCH_SIZE,
  RECONFIRM_DUE_WITHIN_DAYS,
  reconfirmApprovalSubject,
  ReconfirmError,
  selectReconfirmCandidates,
  type ReconfirmBatch,
  type ReconfirmDecision,
  type ReconfirmLedger,
} from '../src/lib/register-reconfirm';
import {
  approvalPageUrl,
  fetchEditorApproval,
  readEditorPasskeys,
  verifyEditorApproval,
  type EditorPasskey,
} from '../src/lib/editor-approval';
import type { Policy } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');
const LEDGER_FILE = path.join(DATA_DIR, 'reconfirmations.json');
const FRAMEWORK_FILE = path.join(DATA_DIR, 'dta-ai-policy-framework.json');

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

async function readLedger(): Promise<ReconfirmLedger> {
  return readJsonFile<ReconfirmLedger>(LEDGER_FILE, { batches: [] });
}

async function propose(args: string[]) {
  const now = new Date();
  const dryRun = args.includes('--dry-run');
  const dueWithinDays = positiveInteger(flag(args, 'due-within'), RECONFIRM_DUE_WITHIN_DAYS, 'due-within');
  const batchSize = positiveInteger(flag(args, 'batch-size'), RECONFIRM_BATCH_SIZE, 'batch-size');

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  const ledger = await readLedger();
  // The DTA framework artifact must not predate its policy's verification,
  // so that record is re-verified together with the artifact, never in a batch.
  const framework = await readJsonFile<{ relatedPolicyId?: string } | null>(FRAMEWORK_FILE, null);
  const excludeIds = new Set(framework?.relatedPolicyId ? [framework.relatedPolicyId] : []);

  const candidates = selectReconfirmCandidates(policies, ledger, { now, dueWithinDays, excludeIds });
  const candidateIds = new Set(candidates.map((policy) => policy.id));
  const audits = await auditRegister(
    policies.filter((policy) => candidateIds.has(policy.id)),
    registerAuditRetrievalOptions(),
  );
  const audited = applyRegisterAuditEvidence(policies, audits);
  const { batches, fullReview } = proposeReconfirmBatches(candidates, audits, audited, ledger, {
    now,
    batchSize,
  });

  console.log(`reconfirm: ${candidates.length} records due within ${dueWithinDays} days`);
  for (const batch of batches) {
    console.log(`\nBatch ${batch.id} (${batch.entries.length} unchanged)`);
    console.log(`  approve: ${approvalPageUrl(reconfirmApprovalSubject(batch))}`);
    for (const entry of batch.entries)
      console.log(`  ${entry.policyId}  verified ${entry.verifiedAt.slice(0, 10)}  ${entry.title}`);
  }
  if (fullReview.length > 0) {
    console.log(`\nFull review needed (${fullReview.length})`);
    for (const item of fullReview) console.log(`  ${item.policyId}  ${item.reason}`);
  }

  if (dryRun) {
    console.log('\nDry run: nothing written.');
    return;
  }
  await writeJsonFile(POLICIES_FILE, audited);
  await writeJsonFile(LEDGER_FILE, { batches: [...ledger.batches, ...batches] });
  console.log(`\nWrote audit evidence and ${batches.length} batch(es).`);
}

async function passkeyDecision(batch: ReconfirmBatch, passkeys: EditorPasskey[]): Promise<ReconfirmDecision> {
  const subject = reconfirmApprovalSubject(batch);
  const approval = await fetchEditorApproval(subject);
  if (!approval) {
    throw new Error(`The editor has not approved batch ${batch.id} with their passkey. Send them ${approvalPageUrl(subject)}`);
  }
  const verified = await verifyEditorApproval(approval, passkeys, subject);
  if (!verified.ok) throw new Error(verified.error);
  return { approvedBy: verified.passkey.reviewer, approvedAt: approval.receivedAt, approval };
}

async function approve(args: string[]) {
  const batchId = flag(args, 'batch');
  if (!batchId) throw new Error('approve needs --batch');
  const ledger = await readLedger();
  const batch = ledger.batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new ReconfirmError([`unknown batch ${batchId}`]);

  const passkeys = await readEditorPasskeys();
  let decision: ReconfirmDecision;
  if (passkeys.length > 0) {
    decision = await passkeyDecision(batch, passkeys);
  } else {
    const attestationUrl = flag(args, 'attestation');
    if (!attestationUrl) throw new Error('approve needs --attestation until an editor passkey is registered');
    decision = {
      approvedBy: flag(args, 'approved-by') ?? 'Daniel Alkurdi',
      approvedAt: flag(args, 'approved-at') ?? new Date().toISOString(),
      attestationUrl,
    };
  }

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  const result = approveReconfirmBatch(policies, ledger, batchId, decision);
  await writeJsonFile(POLICIES_FILE, result.policies);
  await writeJsonFile(LEDGER_FILE, result.ledger);
  console.log(`reconfirm: batch ${batchId} approved by ${decision.approvedBy}, ${batch.entries.length} records renewed.`);
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
