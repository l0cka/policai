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

const DATA_FILES = {
  passkeys: EDITOR_PASSKEYS_PATH,
  sourceReviews: 'data/source-reviews.json',
  ledger: 'data/reconfirmations.json',
  policies: 'data/policies.json',
  timeline: 'data/timeline.json',
  developments: 'data/developments.json',
} as const;

type DataFile = (typeof DATA_FILES)[keyof typeof DATA_FILES];

async function readDataFile(tree: string, file: DataFile): Promise<unknown> {
  const entry = (await git(['ls-tree', '-z', tree, '--', file])).split('\0')[0];
  if (!entry) return undefined;
  const [meta] = entry.split('\t');
  const [mode, type, objectId] = meta.split(' ');
  if (mode !== '100644' || type !== 'blob') {
    throw new Error(`${file} is not a regular file (${mode} ${type}) at ${tree}`);
  }
  try {
    return JSON.parse(await git(['cat-file', 'blob', objectId]));
  } catch (error) {
    throw new Error(`Invalid JSON in ${file} at ${tree}`, { cause: error });
  }
}

async function stateAt(tree: string, mustHave: ReadonlySet<DataFile> = new Set()) {
  const present = new Set<DataFile>();
  const read = async <T>(file: DataFile, fallback: T): Promise<T> => {
    const value = await readDataFile(tree, file);
    if (value !== undefined) {
      present.add(file);
      return value as T;
    }
    if (mustHave.has(file)) {
      throw new Error(`${file} is missing from the pull request but present in the base revision`);
    }
    return fallback;
  };
  const [passkeys, sourceReviews, ledger, policies, timeline, developments] = await Promise.all([
    read<EditorPasskey[]>(DATA_FILES.passkeys, []),
    read<SourceReview[]>(DATA_FILES.sourceReviews, []),
    read<ReconfirmLedger>(DATA_FILES.ledger, { batches: [] }),
    read<Policy[]>(DATA_FILES.policies, []),
    read<TimelineEvent[]>(DATA_FILES.timeline, []),
    read<Development[]>(DATA_FILES.developments, []),
  ]);
  const state: SignedRecordState = {
    passkeys,
    sourceReviews,
    reconfirmBatches: ledger.batches,
    policies,
    timeline,
    developments,
  };
  return { state, present };
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
  const { state: before, present } = await stateAt(base);
  const { state: after } = await stateAt(await mergedTree(base, head), present);

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
