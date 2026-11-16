import { execFile } from 'child_process';
import { promisify } from 'util';
import { EDITOR_PASSKEYS_PATH, type EditorPasskey } from '../src/lib/editor-approval';
import { validateEditorApprovals } from '../src/lib/editor-approval-validation';
import type { ReconfirmLedger } from '../src/lib/register-reconfirm';
import { validateSignedRecordChanges, type SignedRecordState } from '../src/lib/signed-record-changes';
import type { Development, Policy, SourceReview, TimelineEvent } from '../src/types';

const execFileAsync = promisify(execFile);

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

async function showJson<T>(tree: string, file: string, fallback: T): Promise<T> {
  let text: string;
  try {
    text = await git(['show', `${tree}:${file}`]);
  } catch (error) {
    if (/does not exist|exists on disk, but not in/.test(String((error as { stderr?: string }).stderr ?? ''))) return fallback;
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${file} at ${tree}`, { cause: error });
  }
}

async function stateAt(tree: string): Promise<SignedRecordState> {
  const [passkeys, sourceReviews, ledger, policies, timeline, developments] = await Promise.all([
    showJson<EditorPasskey[]>(tree, EDITOR_PASSKEYS_PATH, []),
    showJson<SourceReview[]>(tree, 'data/source-reviews.json', []),
    showJson<ReconfirmLedger>(tree, 'data/reconfirmations.json', { batches: [] }),
    showJson<Policy[]>(tree, 'data/policies.json', []),
    showJson<TimelineEvent[]>(tree, 'data/timeline.json', []),
    showJson<Development[]>(tree, 'data/developments.json', []),
  ]);
  return { passkeys, sourceReviews, reconfirmBatches: ledger.batches, policies, timeline, developments };
}

async function mergedTree(base: string, head: string): Promise<string> {
  try {
    return (await git(['merge-tree', '--write-tree', base, head])).trim();
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) {
      throw new Error(`${head} does not merge cleanly into ${base}; resolve the conflicts first`, { cause: error });
    }
    throw error;
  }
}

async function main() {
  const [baseRevision, headRevision] = process.argv.slice(2);
  if (!baseRevision || !headRevision) {
    throw new Error('Usage: tsx scripts/check-signed-records.ts <base revision> <head revision>');
  }
  const base = (await git(['rev-parse', '--verify', `${baseRevision}^{commit}`])).trim();
  const head = (await git(['rev-parse', '--verify', `${headRevision}^{commit}`])).trim();
  const [before, after] = await Promise.all([stateAt(base), stateAt(await mergedTree(base, head))]);

  const errors = [
    ...(await validateEditorApprovals(after, before)).errors,
    ...validateSignedRecordChanges(after, before).errors,
  ];
  for (const error of errors) console.error(`ERROR ${error}`);
  console.log(
    `check-signed-records: ${head} merged into ${base}: ${after.policies.length} policies, ` +
      `${after.timeline.length} timeline events, ${after.developments.length} developments, ` +
      `${after.passkeys.length} editor passkeys, ${errors.length} errors`,
  );
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('check-signed-records: fatal', error);
  process.exitCode = 1;
});
