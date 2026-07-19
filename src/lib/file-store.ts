import { promises as fs } from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { assertActiveDataMutationLease } from '@/lib/data-lock';

/**
 * Read and parse a JSON file. Missing files may use an explicit fallback, but
 * malformed or unreadable files fail loudly: canonical JSON is the database
 * and must never silently turn into an empty dataset.
 */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  let data: string;
  try {
    data = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return fallback;
    }
    throw error;
  }

  try {
    return JSON.parse(data) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}`, { cause: error });
  }
}

/**
 * Atomically write pretty-printed JSON. The temporary file is created beside
 * the destination so the final rename stays on the same filesystem.
 */
export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf-8');
    // Transactions that hold the repository mutation lock are fenced at the
    // final replacement boundary. A reclaimed owner must not continue a
    // multi-file transaction under a newer owner.
    await assertActiveDataMutationLease();
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
