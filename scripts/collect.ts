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
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import { getAiProvider } from '../src/lib/ai-client';
import {
  collect,
  collectionRunFailed,
  emptyWatchState,
  type WatchState,
} from '../src/lib/pipeline/collect';
import {
  getAutomaticSources,
  getSourceById,
  WATCH_SOURCES,
} from '../src/lib/pipeline/sources';
import {
  mergeSourceReviews,
  reconcileLinkedDevelopments,
} from '../src/lib/source-review';
import { sourceIdentityUrls } from '../src/lib/source-url';
import type {
  CollectionMeta,
  Development,
  Policy,
  SourceReview,
} from '../src/types';

const DEVELOPMENTS_FILE = path.join(
  process.cwd(),
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

  const runCollection = async () => {
    const [state, developments, meta, reviews, policies] = await Promise.all([
      readJsonFile<WatchState>(WATCH_STATE_FILE, emptyWatchState()),
      readJsonFile<Development[]>(DEVELOPMENTS_FILE, []),
      readJsonFile<CollectionMeta | null>(META_FILE, null),
      readJsonFile<SourceReview[]>(SOURCE_REVIEWS_FILE, []),
      readJsonFile<Policy[]>(
        path.join(process.cwd(), 'data', 'policies.json'),
        [],
      ),
    ]);

    const result = await collect({
      sources,
      catalogSources: WATCH_SOURCES,
      state: {
        seen: state.seen ?? {},
        lastCheckedBySource: state.lastCheckedBySource ?? {},
        sourceSnapshots: state.sourceSnapshots ?? {},
      },
      existingDevelopments: reconcileLinkedDevelopments(
        reviews,
        developments,
      ),
      trackedPolicies: policies,
      sourceReviews: reviews,
      trackedUrls: [
        ...policies.flatMap((policy) =>
          sourceIdentityUrls(policy.sourceUrl, policy.verification.source),
        ),
        ...reviews.flatMap((review) =>
          sourceIdentityUrls(review.sourceUrl, review.sourceEvidence),
        ),
      ],
      previousMeta: meta ?? undefined,
      maxItemsPerSource: options.maxItems,
      force: Boolean(options.sourceId),
      logger: (message) => console.log(message),
    });

    console.log(
      `[collect] ${result.developments.length} new developments, ` +
        `${result.reviewCandidates.length} review candidates, ` +
        `${result.errors.length} source errors; ` +
        `health ${result.meta.collector.health} ` +
        `(${result.meta.collector.successfulSourceCount}/${result.meta.collector.dueSourceCount} due sources successful)`,
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

    const runFailed = collectionRunFailed(
      result.meta.collector.health,
      result.errors,
      Boolean(options.sourceId),
    );
    if (runFailed) {
      console.error(
        options.sourceId
          ? '[collect] Targeted source run reported errors — treating run as failed.'
          : '[collect] Source coverage is below the accepted threshold — treating run as failed.',
      );
      process.exitCode = 1;
    }

    if (options.dryRun) {
      console.log('[collect] Dry run — nothing written.');
      return;
    }

    // Stable review ids make retries idempotent, but a recovered candidate can
    // carry newer extraction and proposal evidence. Merge by id instead of
    // dropping updates to an existing pending review.
    const mergedReviews = mergeSourceReviews(
      reviews,
      result.reviewCandidates,
    );
    const developmentById = new Map(
      reconcileLinkedDevelopments(mergedReviews, developments).map(
        (development) => [development.id, development],
      ),
    );
    for (const development of result.developments) {
      developmentById.set(development.id, development);
    }
    const mergedDevelopments = Array.from(developmentById.values()).sort(
      (a, b) =>
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );

    // Persist recoverable outputs before advancing the snapshot/seen state.
    // If an earlier write fails, the next run recreates the same stable IDs.
    if (result.reviewCandidates.length > 0) {
      await writeJsonFile(SOURCE_REVIEWS_FILE, mergedReviews);
    }
    await writeJsonFile(DEVELOPMENTS_FILE, mergedDevelopments);
    await writeJsonFile(WATCH_STATE_FILE, result.state);
    if (!options.sourceId) {
      await writeJsonFile(META_FILE, result.meta);
    }

    console.log(
        `[collect] Wrote ${result.developments.length} developments, ` +
        `${result.reviewCandidates.length} staged or updated reviews. Sources checked: ${result.meta.collector.lastRunSources.length}.`,
    );

  };

  if (options.dryRun) {
    await runCollection();
  } else {
    await withDataMutationLock(runCollection);
  }
}

main().catch((error) => {
  console.error('[collect] Fatal:', error);
  process.exitCode = 1;
});
