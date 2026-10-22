import path from 'path';
import { publicAutomaticCollectionMeta } from '../src/lib/collection-coverage';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import {
  collect,
  collectionRunFailed,
  emptyWatchState,
  type WatchState,
} from '../src/lib/pipeline/collect';
import type { BrowserFetch } from '../src/lib/pipeline/browser-fetch';
import {
  createHostGate,
  robotsFetcher,
  type HostGate,
} from '../src/lib/pipeline/host-gate';
import { retrieveSource } from '../src/lib/pipeline/fetch';
import { advanceSourceHealth } from '../src/lib/pipeline/source-health';
import { refusedHosts, WATCH_SOURCES, type WatchSource } from '../src/lib/pipeline/sources';
import {
  FOLLOW_SOURCE_PREFIX,
  followLegislation,
  followTargets,
  type FollowResult,
} from '../src/lib/legislation/follow';
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
  TimelineEvent,
} from '../src/types';

export interface CollectionRun {
  rootDir: string;
  sources: WatchSource[];
  dryRun: boolean;
  sourceId?: string;
  maxItems?: number;
  fetchImpl?: typeof fetch;
  browserFetchImpl?: BrowserFetch['fetchImpl'];
  hostGate?: HostGate;
  now?: () => Date;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function dataPaths(rootDir: string) {
  return {
    developments: path.join(rootDir, 'data', 'developments.json'),
    meta: path.join(rootDir, 'public', 'data', 'meta.json'),
    watchState: path.join(rootDir, 'data', 'watch-state.json'),
    sourceReviews: path.join(rootDir, 'data', 'source-reviews.json'),
    policies: path.join(rootDir, 'data', 'policies.json'),
    timeline: path.join(rootDir, 'data', 'timeline.json'),
  };
}

export async function runCollection(run: CollectionRun): Promise<void> {
  const paths = dataPaths(run.rootDir);
  const [state, developments, meta, reviews, policies, timelineEvents] =
    await Promise.all([
      readJsonFile<WatchState>(paths.watchState, emptyWatchState()),
      readJsonFile<Development[]>(paths.developments, []),
      readJsonFile<CollectionMeta | null>(paths.meta, null),
      readJsonFile<SourceReview[]>(paths.sourceReviews, []),
      readJsonFile<Policy[]>(
        paths.policies,
        [],
      ),
      readJsonFile<TimelineEvent[]>(
        paths.timeline,
        [],
      ),
    ]);

  const hosts = state.hosts ?? {};
  const hostGate =
    run.hostGate ??
    createHostGate({
      hosts,
      refused: refusedHosts(WATCH_SOURCES),
      fetchRobots: robotsFetcher({ fetchImpl: run.fetchImpl }),
      now: Date.now,
      sleep,
    });
  const result = await collect({
    sources: run.sources,
    catalogSources: WATCH_SOURCES,
    state: {
      seen: state.seen ?? {},
      lastCheckedBySource: state.lastCheckedBySource ?? {},
      sourceSnapshots: state.sourceSnapshots ?? {},
      hosts,
      sourceHealth: state.sourceHealth ?? {},
    },
    hostGate,
    existingDevelopments: reconcileLinkedDevelopments(
      reviews,
      developments,
    ),
    trackedPolicies: policies,
    trackedTimelineEvents: timelineEvents,
    sourceReviews: reviews,
    fetchImpl: run.fetchImpl,
    browserFetchImpl: run.browserFetchImpl,
    now: run.now,
    trackedUrls: reviews.flatMap((review) =>
      sourceIdentityUrls(review.sourceUrl, review.sourceEvidence),
    ),
    previousMeta: meta ?? undefined,
    maxItemsPerSource: run.maxItems,
    force: Boolean(run.sourceId),
    logger: (message) => console.log(message),
  });

  const follow = await followTrackedLegislation(run, policies, reviews, hostGate);
  const reviewCandidates = [...result.reviewCandidates, ...follow.reviews];
  result.state.sourceHealth = advanceSourceHealth(
    result.state.sourceHealth,
    follow.results,
  );

  const publicMeta = run.sourceId
    ? result.meta
    : publicAutomaticCollectionMeta(result.meta, WATCH_SOURCES);

  console.log(
    `[collect] ${result.developments.length} new developments, ` +
      `${result.reviewCandidates.length} review candidates, ` +
      `${follow.reviews.length} stage updates, ` +
      `${result.errors.length} source errors; ` +
      `health ${publicMeta.collector.health} ` +
      `(${publicMeta.collector.successfulSourceCount}/${publicMeta.collector.dueSourceCount} due sources successful)`,
  );
  for (const development of result.developments) {
    console.log(
      `  + [${development.jurisdiction}] ${development.title} ` +
        `(${development.relevanceScore}, ${development.classification}) ${development.url}`,
    );
  }
  for (const error of [...result.errors, ...follow.errors]) {
    console.warn(`  ! ${error}`);
  }

  const runFailed = collectionRunFailed(
    publicMeta.collector.health,
    result.errors,
    Boolean(run.sourceId),
  );
  if (runFailed) {
    console.error(
      run.sourceId
        ? '[collect] Targeted source run reported errors — treating run as failed.'
        : '[collect] Source coverage is below the accepted threshold — treating run as failed.',
    );
    process.exitCode = 1;
  }

  if (run.dryRun) {
    console.log('[collect] Dry run — nothing written.');
    return;
  }

  const mergedReviews = mergeSourceReviews(reviews, reviewCandidates);
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

  if (reviewCandidates.length > 0) {
    await writeJsonFile(paths.sourceReviews, mergedReviews);
  }
  await writeJsonFile(paths.developments, mergedDevelopments);
  await writeJsonFile(paths.watchState, result.state);
  if (!run.sourceId) {
    await writeJsonFile(paths.meta, publicMeta);
  }

  console.log(
    `[collect] Wrote ${result.developments.length} developments, ` +
      `${reviewCandidates.length} staged or updated reviews. Sources checked: ${result.meta.collector.lastRunSources.length}.`,
  );
}

/**
 * Follow watches read each tracked federal bill's APH page through the
 * browser with the Policai identity, since APH refuses plain HTTP clients,
 * and each tracked federal instrument's Federal Register title record over
 * plain HTTP. A run targeted at one catalogue source skips them;
 * `--source track:<policyId>` follows one record.
 */
async function followTrackedLegislation(
  run: CollectionRun,
  policies: Policy[],
  reviews: SourceReview[],
  gate: HostGate,
): Promise<FollowResult> {
  if (run.sourceId && !run.sourceId.startsWith(FOLLOW_SOURCE_PREFIX)) {
    return { reviews: [], errors: [], results: [] };
  }
  const browserFetchImpl = run.browserFetchImpl;
  const targets = followTargets(policies).filter(
    (target) =>
      (!run.sourceId || target.sourceId === run.sourceId) &&
      (target.register !== 'aph' || browserFetchImpl),
  );
  if (!browserFetchImpl) {
    console.log('[follow] No browser retriever; APH bill watches skipped.');
  }
  const now = run.now ?? (() => new Date());
  return followLegislation({
    targets,
    existingReviews: reviews,
    retrieve: (url, register) =>
      register === 'aph'
        ? retrieveSource(url, {
            fetchImpl: browserFetchImpl,
            now,
            gate,
            timeoutMs: 60_000,
            transport: 'browser',
          })
        : retrieveSource(url, { fetchImpl: run.fetchImpl, now, gate }),
    now: now(),
    log: (message) => console.log(message),
  });
}
