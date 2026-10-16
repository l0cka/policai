/**
 * Collector CLI — runs one collection pass over the watch sources and
 * persists the results to the repo's data files. In production the host
 * wrapper ops/collector/policai-collect.sh runs it; run it locally with
 * --dry-run to preview.
 *
 * Usage:
 *   npx tsx scripts/collect.ts [--dry-run] [--source=<id>] [--max-items=<n>]
 *
 * Classification is deterministic keyword analysis with capped confidence;
 * detections always require editorial review.
 */

import { withDataMutationLock } from '../src/lib/data-lock';
import {
  createBrowserFetch,
  type BrowserFetch,
} from '../src/lib/pipeline/browser-fetch';
import {
  getAutomaticSources,
  getSourceById,
} from '../src/lib/pipeline/sources';
import { runCollection } from './collect-run';

interface CliOptions {
  dryRun: boolean;
  sourceId?: string;
  maxItems?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--source=')) options.sourceId = arg.slice(9);
    else if (arg.startsWith('--max-items='))
      options.maxItems = Number(arg.slice(12));
  }
  return options;
}

async function createOptionalBrowserFetch(): Promise<BrowserFetch | null> {
  try {
    await import('playwright-core');
  } catch {
    console.warn(
      '[collect] playwright-core unavailable — browser retrieval disabled.',
    );
    return null;
  }
  return createBrowserFetch();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(
    process.env.USE_CLAUDE_CLASSIFIER
      ? '[collect] Analysis mode: Claude classifier (detections require review)'
      : '[collect] Analysis mode: deterministic heuristics (detections require review)',
  );

  let sources = getAutomaticSources();
  if (options.sourceId) {
    const source = getSourceById(options.sourceId);
    if (!source) {
      console.error(`[collect] Unknown source id: ${options.sourceId}`);
      process.exitCode = 1;
      return;
    }
    sources = [source];
    console.log(
      `[collect] Targeted ${source.automation} source run; global collection health will not be overwritten.`,
    );
  }

  const browserFetch = await createOptionalBrowserFetch();

  const run = () =>
    runCollection({
      rootDir: process.cwd(),
      sources,
      dryRun: options.dryRun,
      sourceId: options.sourceId,
      maxItems: options.maxItems,
      browserFetchImpl: browserFetch?.fetchImpl,
    });

  try {
    if (options.dryRun) {
      await run();
    } else {
      await withDataMutationLock(run);
    }
  } finally {
    await browserFetch?.close();
  }
}

main().catch((error) => {
  console.error('[collect] Fatal:', error);
  process.exitCode = 1;
});
