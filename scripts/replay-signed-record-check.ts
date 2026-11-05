/**
 * Replays merged data commits on main through validateSignedRecordChanges,
 * each against its first parent, and prints one row per commit.
 *
 * Commits from before the editor passkey was registered carry card-link
 * attestations instead of signatures. --attested-as-signed counts those as
 * signed, so the rule can be tried on older history.
 *
 * Usage: npx tsx scripts/replay-signed-record-check.ts [--limit=15] [--attested-as-signed]
 */

import { execFileSync } from 'child_process';
import { EDITOR_PASSKEYS_PATH, type EditorApproval, type EditorPasskey } from '../src/lib/editor-approval';
import type { ReconfirmLedger } from '../src/lib/register-reconfirm';
import { validateSignedRecordChanges, type SignedRecordState } from '../src/lib/signed-record-changes';

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

function show<T>(sha: string, file: string, fallback: T): T {
  try {
    return JSON.parse(git(['show', `${sha}:${file}`])) as T;
  } catch {
    return fallback;
  }
}

const attestedAsSigned = process.argv.includes('--attested-as-signed');
const placeholder = {} as EditorApproval;
const currentPasskeys = show<EditorPasskey[]>('HEAD', EDITOR_PASSKEYS_PATH, []);

function state(sha: string): SignedRecordState {
  const ledger = show<ReconfirmLedger>(sha, 'data/reconfirmations.json', { batches: [] });
  const sourceReviews = show<SignedRecordState['sourceReviews']>(sha, 'data/source-reviews.json', []);
  let passkeys = show<EditorPasskey[]>(sha, EDITOR_PASSKEYS_PATH, []);
  if (attestedAsSigned) {
    if (passkeys.length === 0) passkeys = currentPasskeys;
    for (const review of sourceReviews) {
      if (review.decision?.attestationUrl && !review.decision.approval) review.decision.approval = placeholder;
    }
    for (const batch of ledger.batches) {
      if (batch.decision?.attestationUrl && !batch.decision.approval) batch.decision.approval = placeholder;
    }
  }
  return {
    passkeys,
    sourceReviews,
    reconfirmBatches: ledger.batches,
    policies: show(sha, 'data/policies.json', []),
    timeline: show(sha, 'data/timeline.json', []),
    developments: show(sha, 'data/developments.json', []),
  };
}

const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.slice(8) ?? 15);
const commits = git(['log', '--first-parent', `-${limit}`, '--format=%h%x09%ad%x09%s', '--date=short', 'origin/main', '--', 'data/'])
  .trim()
  .split('\n');

for (const line of commits) {
  const [sha, date, subject] = line.split('\t');
  const head = state(sha);
  if (head.passkeys.length === 0) {
    console.log(`${sha}\t${date}\tskipped (no passkey registered)\t${subject}`);
    continue;
  }
  const { errors } = validateSignedRecordChanges(head, state(`${sha}^1`));
  console.log(`${sha}\t${date}\t${errors.length === 0 ? 'pass' : `FAIL ${errors.length}`}\t${subject}`);
  for (const error of errors) console.log(`    ${error}`);
}
