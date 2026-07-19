/* @vitest-environment node */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withFileLock } from './file-lock';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('withFileLock', () => {
  it('serializes concurrent file-backed transactions', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'policai-lock-'),
    );
    temporaryDirectories.push(directory);
    const lockPath = path.join(directory, 'data.lock');
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });

    const first = withFileLock(
      lockPath,
      async () => {
        order.push('first:start');
        firstEntered();
        await firstGate;
        order.push('first:end');
      },
      { pollMs: 5 },
    );
    await entered;
    const second = withFileLock(
      lockPath,
      async () => {
        order.push('second:start');
        order.push('second:end');
      },
      { pollMs: 5 },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });

  it('recovers a lock left by a provably terminated local process', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'policai-stale-lock-'),
    );
    temporaryDirectories.push(directory);
    const lockPath = path.join(directory, 'data.lock');
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        ownerToken: 'terminated-process',
        pid: 999_999_999,
        hostname: os.hostname(),
        acquiredAt: '2026-07-16T00:00:00.000Z',
      }),
      'utf8',
    );

    const result = await withFileLock(
      lockPath,
      async () => 'recovered',
      { pollMs: 1, timeoutMs: 1_000 },
    );

    expect(result).toBe('recovered');
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not expire a live owner merely because a waiter has waited', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'policai-live-lock-'),
    );
    temporaryDirectories.push(directory);
    const lockPath = path.join(directory, 'data.lock');
    let releaseOwner!: () => void;
    const ownerGate = new Promise<void>((resolve) => {
      releaseOwner = resolve;
    });
    let ownerEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      ownerEntered = resolve;
    });
    const order: string[] = [];

    const owner = withFileLock(lockPath, async () => {
      order.push('owner:start');
      ownerEntered();
      await ownerGate;
      order.push('owner:end');
    });
    await entered;
    const waiter = withFileLock(
      lockPath,
      async () => {
        order.push('waiter');
      },
      { pollMs: 1 },
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(order).toEqual(['owner:start']);
    releaseOwner();
    await Promise.all([owner, waiter]);
    expect(order).toEqual(['owner:start', 'owner:end', 'waiter']);
  });

  it('reclaims a lock when an unrelated live process has reused the owner pid', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'policai-recycled-pid-lock-'),
    );
    temporaryDirectories.push(directory);
    const lockPath = path.join(directory, 'data.lock');
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        ownerToken: 'owner-from-an-earlier-process',
        pid: process.pid,
        hostname: os.hostname(),
        acquiredAt: '2026-07-16T00:00:00.000Z',
        processStartedAt: '2026-07-15T00:00:00.000Z',
      }),
      'utf8',
    );

    await expect(
      withFileLock(
        lockPath,
        async () => 'recovered-from-recycled-pid',
        { pollMs: 1, timeoutMs: null },
      ),
    ).resolves.toBe('recovered-from-recycled-pid');
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serializes competing waiters while reclaiming one dead owner', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'policai-reclaim-race-'),
    );
    temporaryDirectories.push(directory);
    const lockPath = path.join(directory, 'data.lock');
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        ownerToken: 'terminated-process',
        pid: 999_999_999,
        hostname: os.hostname(),
        acquiredAt: '2026-07-16T00:00:00.000Z',
      }),
      'utf8',
    );
    let active = 0;
    let maximumActive = 0;

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        withFileLock(
          lockPath,
          async () => {
            active++;
            maximumActive = Math.max(maximumActive, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active--;
            return index;
          },
          { pollMs: 1, timeoutMs: 2_000 },
        ),
      ),
    );

    expect(maximumActive).toBe(1);
  });
});
