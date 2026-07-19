import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

interface FileLockOptions {
  /** `null` waits indefinitely; callers should prefer a bounded timeout. */
  timeoutMs?: number | null;
  pollMs?: number;
}

interface FileLockOwner {
  ownerToken: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
  processStartedAt?: string;
}

export interface FileLockLease {
  readonly ownerToken: string;
  /** Fail before a write when this transaction no longer owns the lock. */
  assertOwned(): Promise<void>;
}

const DEFAULT_POLL_MS = 50;
const DEFAULT_TIMEOUT_MS = 120_000;
const PROCESS_START_TOLERANCE_MS = 2_000;
const execFileAsync = promisify(execFile);

function hasCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === code
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function readOwner(lockPath: string): Promise<FileLockOwner | null> {
  try {
    const owner = JSON.parse(
      await fs.readFile(lockPath, 'utf8'),
    ) as Partial<FileLockOwner>;
    if (
      typeof owner.ownerToken !== 'string' ||
      typeof owner.pid !== 'number' ||
      typeof owner.hostname !== 'string' ||
      typeof owner.acquiredAt !== 'string'
    ) {
      return null;
    }
    return owner as FileLockOwner;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

function isLocalProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM proves that the process exists even when it cannot be signalled.
    if (hasCode(error, 'EPERM')) return true;
    if (hasCode(error, 'ESRCH')) return false;
    return true;
  }
}

async function localProcessStartedAt(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      '/bin/ps',
      ['-o', 'lstart=', '-p', String(pid)],
      { encoding: 'utf8' },
    );
    const startedAt = Date.parse(stdout.trim());
    return Number.isFinite(startedAt)
      ? new Date(startedAt).toISOString()
      : null;
  } catch {
    return null;
  }
}

async function isCurrentLocalOwner(owner: FileLockOwner): Promise<boolean> {
  if (!isLocalProcessAlive(owner.pid)) return false;
  const observedStart = await localProcessStartedAt(owner.pid);
  if (!observedStart) {
    // Without start identity, liveness is the conservative safe answer.
    return true;
  }
  const observedStartMs = Date.parse(observedStart);
  const recordedStartMs = Date.parse(owner.processStartedAt ?? '');
  if (Number.isFinite(recordedStartMs)) {
    return (
      Math.abs(observedStartMs - recordedStartMs) <=
      PROCESS_START_TOLERANCE_MS
    );
  }
  const acquiredAtMs = Date.parse(owner.acquiredAt);
  return (
    !Number.isFinite(acquiredAtMs) ||
    observedStartMs <= acquiredAtMs + PROCESS_START_TOLERANCE_MS
  );
}

/**
 * Reclaim only a lock whose owner is provably terminated on this host.
 * A timer cannot safely distinguish a dead writer from a paused one, so
 * foreign-host, malformed, and still-live ownership is deliberately retained.
 */
async function createOwnershipFile(
  filePath: string,
  owner: FileLockOwner,
): Promise<boolean> {
  const candidatePath = `${filePath}.${owner.ownerToken.replaceAll(':', '-')}.candidate`;
  try {
    await fs.writeFile(candidatePath, JSON.stringify(owner), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fs.link(candidatePath, filePath);
    return true;
  } catch (error) {
    if (hasCode(error, 'EEXIST')) return false;
    throw error;
  } finally {
    await fs.rm(candidatePath, { force: true }).catch(() => undefined);
  }
}

async function removeOwnershipFile(
  filePath: string,
  ownerToken: string,
): Promise<void> {
  const owner = await readOwner(filePath);
  if (owner?.ownerToken !== ownerToken) return;
  await fs.rm(filePath, { force: true });
}

async function recoverAbandonedLock(
  lockPath: string,
  reclaimer: FileLockOwner,
): Promise<void> {
  const reclaimPath = `${lockPath}.reclaiming`;
  if (!(await createOwnershipFile(reclaimPath, reclaimer))) return;

  try {
    const observedOwner = await readOwner(lockPath);
    if (
      !observedOwner ||
      observedOwner.hostname !== os.hostname() ||
      await isCurrentLocalOwner(observedOwner)
    ) {
      return;
    }

    // The reclaim marker excludes competing takeovers. Acquisition verifies
    // that marker after linking, so a contender paused before the marker was
    // created cannot become a valid owner during this rename.
    const currentOwner = await readOwner(lockPath);
    if (currentOwner?.ownerToken !== observedOwner.ownerToken) return;

    const abandonedPath = `${lockPath}.abandoned.${randomUUID()}`;
    try {
      await fs.rename(lockPath, abandonedPath);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return;
      throw error;
    }
    await fs.rm(abandonedPath, { force: true });
  } finally {
    // A crash while reclaiming intentionally leaves this marker in place. It
    // is safer to require manual inspection than to guess that a takeover was
    // not paused between validation and rename.
    await removeOwnershipFile(reclaimPath, reclaimer.ownerToken);
  }
}

async function acquireFileLock(
  lockPath: string,
  owner: FileLockOwner,
  options: Required<Pick<FileLockOptions, 'pollMs'>> & {
    timeoutMs: number | null;
  },
): Promise<void> {
  const directory = path.dirname(lockPath);
  await fs.mkdir(directory, { recursive: true });
  const deadline =
    options.timeoutMs === null
      ? null
      : Date.now() + options.timeoutMs;
  while (true) {
    const reclaimPath = `${lockPath}.reclaiming`;
    if (!(await pathExists(reclaimPath))) {
      // The candidate is complete before the hard link makes it visible as
      // the lock. A process crash can therefore leave only a harmless
      // candidate or a fully attributed lock, never an ownerless lock.
      if (await createOwnershipFile(lockPath, owner)) {
        if (!(await pathExists(reclaimPath))) return;
        await removeOwnershipFile(lockPath, owner.ownerToken);
      }
    }

    await recoverAbandonedLock(lockPath, owner);
    if (deadline !== null && Date.now() >= deadline) {
      const blockingOwner = await readOwner(lockPath);
      const ownerSummary = blockingOwner
        ? ` Owner ${blockingOwner.ownerToken} (pid ${blockingOwner.pid} on ${blockingOwner.hostname}, acquired ${blockingOwner.acquiredAt}) still holds it; inspect the process and lock file before manual removal.`
        : '';
      throw new Error(
        `Timed out waiting for data mutation lock ${lockPath}.${ownerSummary}`,
      );
    }
    await wait(options.pollMs);
  }
}

async function assertFileLockOwner(
  lockPath: string,
  ownerToken: string,
): Promise<void> {
  const owner = await readOwner(lockPath);
  if (owner?.ownerToken !== ownerToken) {
    throw new Error(
      `Data mutation lock ownership was lost for ${lockPath}; refusing to write`,
    );
  }
}

async function releaseFileLock(
  lockPath: string,
  ownerToken: string,
): Promise<void> {
  await removeOwnershipFile(lockPath, ownerToken);
}

/**
 * Serialize a cross-process file-backed transaction. Healthy owners are never
 * expired, waiting is bounded by default, and only a provably dead local
 * process can be reclaimed automatically.
 */
export async function withFileLock<T>(
  lockPath: string,
  run: (lease: FileLockLease) => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const resolved = {
    timeoutMs:
      options.timeoutMs === undefined
        ? DEFAULT_TIMEOUT_MS
        : options.timeoutMs,
    pollMs: options.pollMs ?? DEFAULT_POLL_MS,
  };
  const owner: FileLockOwner = {
    ownerToken: `${process.pid}:${randomUUID()}`,
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
    processStartedAt:
      (await localProcessStartedAt(process.pid)) ??
      new Date(Date.now() - process.uptime() * 1_000).toISOString(),
  };
  await acquireFileLock(lockPath, owner, resolved);
  const lease: FileLockLease = {
    ownerToken: owner.ownerToken,
    assertOwned: () => assertFileLockOwner(lockPath, owner.ownerToken),
  };

  try {
    return await run(lease);
  } finally {
    await releaseFileLock(lockPath, owner.ownerToken);
  }
}
