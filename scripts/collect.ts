/**
 * Collector CLI — runs one collection pass over the watch sources and
 * persists the results to the repo's data files. In production this runs
 * in the daily GitHub Actions workflow, which commits the changes; run it
 * locally with --dry-run to preview.
 *
 * Usage:
 *   npx tsx scripts/collect.ts [--dry-run] [--source=<id>] [--max-items=<n>]
 *
 * Environment:
 *   ANTHROPIC_API_KEY or OPENROUTER_API_KEY — optional; enables AI
 *   classification. Without a key, detection falls back to keyword
 *   heuristics with capped confidence.
 */

import path from 'path';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import { getAiProvider } from '../src/lib/ai-client';
import {
  collect,
  emptyWatchState,
  type WatchState,
} from '../src/lib/pipeline/collect';
import { getEnabledSources, getSourceById } from '../src/lib/pipeline/sources';
import type {
  CollectionMeta,
  Development,
  SourceReview,
} from '../src/types';

const DEVELOPMENTS_FILE = path.join(
  process.cwd(),
  'public',
  'data',
  'developments.json',
);
const META_FILE = path.join(process.cwd(), 'public', 'data', 'meta.json');
const WATCH_STATE_FILE = path.join(process.cwd(), 'data', 'watch-state.json');
const SOURCE_REVIEWS_FILE = path.join(
  process.cwd(),
  'data',
  'source-reviews.json',
);

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

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const provider = getAiProvider();
  console.log(
    `[collect] AI provider: ${provider ?? 'none (heuristic mode — detections will need review)'}`,
  );

  let sources = getEnabledSources();
  if (options.sourceId) {
    const source = getSourceById(options.sourceId);
    if (!source) {
      console.error(`[collect] Unknown source id: ${options.sourceId}`);
      process.exitCode = 1;
      return;
    }
    sources = [source];
  }

  const [state, developments, meta, reviews] = await Promise.all([
    readJsonFile<WatchState>(WATCH_STATE_FILE, emptyWatchState()),
    readJsonFile<Development[]>(DEVELOPMENTS_FILE, []),
    readJsonFile<CollectionMeta | null>(META_FILE, null),
    readJsonFile<SourceReview[]>(SOURCE_REVIEWS_FILE, []),
  ]);

  const result = await collect({
    sources,
    state: {
      seen: state.seen ?? {},
      lastCheckedBySource: state.lastCheckedBySource ?? {},
    },
    existingDevelopments: developments,
    previousMeta: meta ?? undefined,
    maxItemsPerSource: options.maxItems,
    logger: (message) => console.log(message),
  });

  console.log(
    `[collect] ${result.developments.length} new developments, ` +
      `${result.reviewCandidates.length} review candidates, ` +
      `${result.errors.length} source errors`,
  );
  for (const development of result.developments) {
    console.log(
      `  + [${development.jurisdiction}] ${development.title} ` +
        `(${development.relevanceScore}, ${development.classification}) ${development.url}`,
    );
  }
  for (const error of result.errors) {
    console.warn(`  ! ${error}`);
  }

  if (options.dryRun) {
    console.log('[collect] Dry run — nothing written.');
    return;
  }

  // Merge review candidates, skipping URLs already tracked or staged.
  const knownReviewUrls = new Set(reviews.map((review) => review.sourceUrl));
  const newReviews = result.reviewCandidates.filter(
    (candidate) => !knownReviewUrls.has(candidate.sourceUrl),
  );

  await Promise.all([
    writeJsonFile(DEVELOPMENTS_FILE, [...result.developments, ...developments]),
    writeJsonFile(WATCH_STATE_FILE, result.state),
    writeJsonFile(META_FILE, result.meta),
    newReviews.length > 0
      ? writeJsonFile(SOURCE_REVIEWS_FILE, [...newReviews, ...reviews])
      : Promise.resolve(),
  ]);

  console.log(
    `[collect] Wrote ${result.developments.length} developments, ` +
      `${newReviews.length} staged reviews. Sources checked: ${result.meta.collector.lastRunSources.length}.`,
  );

  // A run where every source failed should fail the workflow loudly.
  if (
    result.meta.collector.lastRunSources.length > 0 &&
    result.errors.length >= result.meta.collector.lastRunSources.length
  ) {
    console.error('[collect] Every source failed — treating run as failed.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[collect] Fatal:', error);
  process.exitCode = 1;
});
