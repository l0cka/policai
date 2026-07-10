import type {
  CollectionMeta,
  Development,
  Policy,
  SourceReview,
} from '@/types';
import { normalizeJurisdiction, normalizePolicyType } from '@/types';
import { classifyCandidate, type Classification } from './classify';
import {
  extractCandidatesFromHtml,
  extractCandidatesFromRss,
  type Candidate,
} from './extract';
import { getEnabledSources, type WatchSource } from './sources';

/**
 * Seen-URL registry, committed to the repo (data/watch-state.json) so the
 * collector only reports genuinely new items across runs.
 */
export interface WatchState {
  seen: Record<string, { firstSeenAt: string; sourceId: string }>;
  lastCheckedBySource: Record<string, string>;
}

export interface CollectOptions {
  sources?: WatchSource[];
  state: WatchState;
  existingDevelopments: Development[];
  previousMeta?: CollectionMeta;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  maxItemsPerSource?: number;
  /** Detections at or above this score enter the developments feed. */
  minScoreForDevelopment?: number;
  /** Detections at or above this score are also staged for curated review. */
  minScoreForReview?: number;
  logger?: (message: string) => void;
}

export interface CollectResult {
  developments: Development[];
  reviewCandidates: SourceReview[];
  state: WatchState;
  meta: CollectionMeta;
  errors: string[];
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Policai/1.0 (+https://policai.com.au)';
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ITEMS_PER_SOURCE = 5;
const DEFAULT_MIN_SCORE_FOR_DEVELOPMENT = 0.5;
const DEFAULT_MIN_SCORE_FOR_REVIEW = 0.7;
const WEEKLY_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;

export function emptyWatchState(): WatchState {
  return { seen: {}, lastCheckedBySource: {} };
}

function slugify(value: string, maxLength = 60): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxLength);
}

/** Small stable hash so development IDs stay unique per URL. */
function hashUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 33) ^ url.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function isDue(
  source: WatchSource,
  state: WatchState,
  now: Date,
): boolean {
  if (source.schedule === 'daily') return true;
  const lastChecked = state.lastCheckedBySource[source.id];
  if (!lastChecked) return true;
  return now.getTime() - new Date(lastChecked).getTime() >= WEEKLY_INTERVAL_MS;
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function buildDevelopment(
  candidate: Candidate,
  source: WatchSource,
  classification: Classification,
  nowIso: string,
): Development {
  return {
    id: `dev-${slugify(candidate.title, 48) || 'item'}-${hashUrl(candidate.url)}`,
    title: candidate.title,
    url: candidate.url,
    sourceId: source.id,
    sourceName: source.name,
    jurisdiction: classification.suggestedJurisdiction ?? source.jurisdiction,
    publishedAt: candidate.dateHint,
    detectedAt: nowIso,
    summary: classification.summary,
    relevanceScore: Number(classification.relevanceScore.toFixed(2)),
    classification: classification.classification,
    status: 'detected',
  };
}

function buildReviewCandidate(
  development: Development,
  candidate: Candidate,
  source: WatchSource,
  classification: Classification,
  nowIso: string,
): SourceReview {
  const proposedRecord: Policy = {
    id: slugify(candidate.title) || development.id,
    title: candidate.title,
    description: classification.summary || candidate.text,
    jurisdiction: development.jurisdiction,
    type: normalizePolicyType(classification.suggestedType),
    status: 'active',
    effectiveDate: candidate.dateHint || nowIso.split('T')[0],
    agencies: classification.agencies,
    sourceUrl: candidate.url,
    content: candidate.text,
    aiSummary: classification.summary || '',
    tags: classification.tags,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    id: `source-review-${development.id}`,
    sourceUrl: candidate.url,
    title: candidate.title,
    entryKind: 'policy',
    status: 'pending_review',
    discoveredAt: nowIso,
    createdBy: 'collector',
    notes: `Detected by the collector from ${source.name} (score ${development.relevanceScore}, ${development.classification}).`,
    analysis: {
      isRelevant: classification.isRelevant,
      relevanceScore: classification.relevanceScore,
      suggestedType: classification.suggestedType ?? null,
      suggestedJurisdiction: normalizeJurisdiction(
        classification.suggestedJurisdiction,
        source.jurisdiction,
      ),
      summary: classification.summary || candidate.text,
      tags: classification.tags,
      agencies: classification.agencies,
    },
    proposedRecord,
    updatedAt: nowIso,
  };
}

/**
 * Run one collection pass over the watch sources.
 *
 * Pure with respect to I/O: reads nothing from disk and writes nothing —
 * callers pass in state/feed snapshots and persist the returned copies.
 * The result never contains direct policy-registry writes; high-confidence
 * detections are staged as review candidates instead.
 */
export async function collect(options: CollectOptions): Promise<CollectResult> {
  const sources = options.sources ?? getEnabledSources();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ? options.now() : new Date();
  const nowIso = now.toISOString();
  const log = options.logger ?? (() => {});
  const maxItemsPerSource =
    options.maxItemsPerSource ?? DEFAULT_MAX_ITEMS_PER_SOURCE;
  const minScoreForDevelopment =
    options.minScoreForDevelopment ?? DEFAULT_MIN_SCORE_FOR_DEVELOPMENT;
  const minScoreForReview =
    options.minScoreForReview ?? DEFAULT_MIN_SCORE_FOR_REVIEW;

  const state: WatchState = {
    seen: { ...options.state.seen },
    lastCheckedBySource: { ...options.state.lastCheckedBySource },
  };
  const knownUrls = new Set([
    ...Object.keys(state.seen),
    ...options.existingDevelopments.map((development) => development.url),
  ]);

  const developments: Development[] = [];
  const reviewCandidates: SourceReview[] = [];
  const errors: string[] = [];
  const checkedSources: string[] = [];

  for (const source of sources) {
    if (!isDue(source, state, now)) {
      log(`[collect] ${source.id}: not due yet, skipping`);
      continue;
    }

    checkedSources.push(source.id);
    try {
      const body = await fetchText(source.url, fetchImpl);
      const candidates =
        source.kind === 'rss'
          ? extractCandidatesFromRss(body, source.url)
          : extractCandidatesFromHtml(body, source.url);

      const fresh = candidates
        .filter((candidate) => !knownUrls.has(candidate.url))
        .slice(0, maxItemsPerSource);

      log(
        `[collect] ${source.id}: ${candidates.length} candidates, ${fresh.length} new`,
      );

      for (const candidate of fresh) {
        knownUrls.add(candidate.url);
        state.seen[candidate.url] = {
          firstSeenAt: nowIso,
          sourceId: source.id,
        };

        let pageHtml: string | null = null;
        try {
          pageHtml = await fetchText(candidate.url, fetchImpl);
        } catch {
          log(`[collect] ${source.id}: could not fetch ${candidate.url}`);
        }

        const classification = await classifyCandidate(candidate, pageHtml);
        if (
          !classification.isRelevant ||
          classification.relevanceScore < minScoreForDevelopment
        ) {
          continue;
        }

        const development = buildDevelopment(
          candidate,
          source,
          classification,
          nowIso,
        );
        developments.push(development);

        if (classification.relevanceScore >= minScoreForReview) {
          reviewCandidates.push(
            buildReviewCandidate(
              development,
              candidate,
              source,
              classification,
              nowIso,
            ),
          );
        }
      }

      state.lastCheckedBySource[source.id] = nowIso;
    } catch (error) {
      const message = `${source.id}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      errors.push(message);
      log(`[collect] FAILED ${message}`);
    }
  }

  const previousMeta = options.previousMeta;
  const meta: CollectionMeta = {
    lastCollectedAt: nowIso,
    lastReviewedAt: previousMeta?.lastReviewedAt ?? null,
    collector: {
      runCount: (previousMeta?.collector.runCount ?? 0) + 1,
      lastRunSources: checkedSources,
      lastRunErrors: errors,
    },
  };

  return { developments, reviewCandidates, state, meta, errors };
}
