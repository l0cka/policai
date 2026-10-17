import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CollectionMeta } from '../src/types';
import { buildE24Report, formatE24Report } from '../src/lib/pipeline/e24-report';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const metaPath = argument('meta') ?? path.join(process.cwd(), 'public', 'data', 'meta.json');
  const logPath = argument('log');
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as CollectionMeta;
  const log = logPath ? await readFile(logPath, 'utf8') : '';
  const report = buildE24Report(meta, log);
  console.log(
    process.argv.includes('--json')
      ? JSON.stringify(report, null, 2)
      : formatE24Report(report),
  );
}

main().catch((error) => {
  console.error('[report:e24] Fatal:', error);
  process.exitCode = 1;
});
