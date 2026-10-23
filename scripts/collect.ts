/**
 * Collector CLI — runs one collection pass over the watch sources and
 * persists the results to the repo's data files. In production the host
 * wrapper ops/collector/policai-collect.sh runs it; run it locally with
 * --dry-run to preview.
 *
 * Usage:
 *   npx tsx scripts/collect.ts [--dry-run] [--source=<id>] [--max-items=<n>]
 *
 * Classification is deterministic keyword analysis with capped confidence.
 * USE_CLEF_CLASSIFIER=1 asks the local clef-flash model instead when the GPU
 * and model are available. Detections always require editorial review.
 * POLICAI_COLLECTOR_STATE names the host folder holding the collector's watch
 * state and outbox (see scripts/collect-run.ts).
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
import {
  CLEF_MODEL,
  clefUnavailableReason,
  createClefScorer,
  type RelevanceScorer,
} from '../src/lib/pipeline/clef-classify';
import { runCollection } from './collect-run';
import { FOLLOW_SOURCE_PREFIX } from '../src/lib/legislation/follow';

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

async function createOptionalClefScorer(): Promise<RelevanceScorer | undefined> {
  if (process.env.USE_CLEF_CLASSIFIER !== '1') {
    console.log('[collect] Analysis mode: keyword rules (detections require review)');
    return undefined;
  }
  const unavailable = await clefUnavailableReason();
  if (unavailable) {
    console.warn(`[collect] Analysis mode: keyword rules; Clef unavailable (${unavailable})`);
    return undefined;
  }
  console.log(`[collect] Analysis mode: local ${CLEF_MODEL} (detections require review)`);
  return createClefScorer({ log: (message) => console.warn(message) });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const scoreRelevance = await createOptionalClefScorer();

  let sources = getAutomaticSources();
  if (options.sourceId?.startsWith(FOLLOW_SOURCE_PREFIX)) {
    sources = [];
    console.log(
      `[collect] Targeted follow watch ${options.sourceId}; catalogue sources are skipped.`,
    );
  } else if (options.sourceId) {
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
      recycleBrowser: browserFetch?.close,
      scoreRelevance,
      stateDir: process.env.POLICAI_COLLECTOR_STATE || undefined,
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
