import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { inDataOverlay } from '@/lib/data-overlay';
import {
  withFileLock,
  type FileLockLease,
} from '@/lib/file-lock';

const DATA_MUTATION_LOCK = path.join(
  process.cwd(),
  'data',
  '.mutation.lock',
);

const activeDataLease = new AsyncLocalStorage<FileLockLease>();

export async function assertActiveDataMutationLease(): Promise<void> {
  await activeDataLease.getStore()?.assertOwned();
}

export function withDataMutationLock<T>(
  run: () => Promise<T>,
): Promise<T> {
  if (inDataOverlay()) return run();
  return withFileLock(
    DATA_MUTATION_LOCK,
    (lease) => activeDataLease.run(lease, run),
    { timeoutMs: null },
  );
}
