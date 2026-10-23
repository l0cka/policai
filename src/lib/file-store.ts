import { promises as fs } from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { assertActiveDataMutationLease } from '@/lib/data-lock';
import { readBundledFile } from '@/lib/bundled-files';
import { readDataOverlay, writeDataOverlay } from '@/lib/data-overlay';

async function readFileText(filePath: string): Promise<string | null> {
  const overlay = readDataOverlay(filePath);
  if (overlay) return overlay;
  const bundled = await readBundledFile(filePath);
  if (bundled !== undefined) return bundled;
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  const data = await readFileText(filePath);
  if (data === null) return fallback;

  try {
    return JSON.parse(data) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}`, { cause: error });
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const serialized = JSON.stringify(data, null, 2);
  if (writeDataOverlay(filePath, serialized)) return;

  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporaryPath, serialized, 'utf-8');
    await assertActiveDataMutationLease();
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
