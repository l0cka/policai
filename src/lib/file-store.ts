import { promises as fs } from 'fs';
import path from 'path';

/**
 * Read and parse a JSON file, returning the fallback value if the file
 * doesn't exist or contains invalid JSON.
 */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

/**
 * Write data to a JSON file with pretty-printing.
 */
export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
