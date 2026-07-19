import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
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

/** Fence a canonical write if this transaction's lock was replaced. */
export async function assertActiveDataMutationLease(): Promise<void> {
  await activeDataLease.getStore()?.assertOwned();
}

/** Serialize repository data transactions across MCP and CLI processes. */
export function withDataMutationLock<T>(
  run: () => Promise<T>,
): Promise<T> {
  return withFileLock(
    DATA_MUTATION_LOCK,
    (lease) => activeDataLease.run(lease, run),
    // Long collector/audit transactions remain serialised. File-lock owner
    // identity distinguishes a recycled PID from the original live process.
    { timeoutMs: null },
  );
}
