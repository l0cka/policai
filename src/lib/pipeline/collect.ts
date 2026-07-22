import type {
  CollectionHealthStatus,
  CollectionMeta,
  Development,
  Policy,
  PolicyDraft,
  SourceEvidence,
  SourceReview,
  SourceRunResult,
  TimelineEvent,
  TimelineEventDraft,
} from '@/types';
import { normalizeJurisdiction, normalizePolicyType } from '@/types';
import { classifyCandidate, type Classification } from './classify';
import { extractRetrievedDocument } from './content';
import {
  extractFromHtml,
  extractFromRss,
  type Candidate,
} from './extract';
import {
  retrieveSource,
  SourceFetchError,
  type RetrievedSource,
} from './fetch';
import {
  getAutomaticSources,
  WATCH_SOURCES,
  type WatchSource,
} from './sources';
import {
  canonicalizeSourceEvidence,
  canonicalizeSourceUrl,
  isAllowedSourceHost,
  sourceUrlIdentity,
  sourceUrlsEqual,
} from '@/lib/source-url';
import {
  policyRevisionHash,
  timelineRevisionHash,
} from '@/lib/policy-revision';

export type CandidateProcessingStatus =
  | 'pending'
  | 'awaiting_review'
  | 'approved'
  | 'processed'
  | 'dismissed'
  | 'failed';

export interface SeenCandidate {
  firstSeenAt: string;
  sourceId: string;
  status?: CandidateProcessingStatus;
  attempts?: number;
  lastAttemptAt?: string;
  processedAt?: string;
  lastError?: string;
  candidate?: Candidate;
}

export interface SourceSnapshot {
  contentHash: string;
  firstCheckedAt: string;
  lastCheckedAt: string;
  lastChangedAt?: string;
  changeCount?: number;
}

/**
 * Collector state is committed to Git so candidate retries and direct-document
 * snapshots survive between scheduled runs.
 */
export interface WatchState {
  seen: Record<string, SeenCandidate>;
  lastCheckedBySource: Record<string, string>;
  sourceSnapshots: Record<string, SourceSnapshot>;
}

export interface CollectOptions {
  sources?: WatchSource[];
  /** Full catalogue used for public automatic/manual coverage counts. */
  catalogSources?: WatchSource[];
  state: WatchState;
  existingDevelopments: Development[];
  /** Canonical or staged URLs that must not be rediscovered as new leads. */
  trackedUrls?: readonly string[];
  /** Canonical policies used to turn changed documents into update reviews. */
  trackedPolicies?: readonly Policy[];
  /** Canonical timeline events used to turn changed documents into update reviews. */
  trackedTimelineEvents?: readonly TimelineEvent[];
  /** Persisted reviews used to recover document-version ordering after partial writes. */
  sourceReviews?: readonly SourceReview[];
  previousMeta?: CollectionMeta;
  fetchImpl?: typeof fetch;
  /**
   * Headless-browser retriever with the fetch signature. Used directly for
   * fetchStrategy 'browser' sources and as a fallback when the primary
   * retriever is blocked or an index renders no extractable items.
   */
  browserFetchImpl?: typeof fetch;
  now?: () => Date;
  maxItemsPerSource?: number;
  /** Bypass schedule checks, used by explicit targeted diagnostics. */
  force?: boolean;
  /** Detections at or above this score enter the developments feed. */
  minScoreForDevelopment?: number;
  /** AI detections at or above this score are staged for curated review. */
  minScoreForReview?: number;
  /** A run below this successful-source ratio is failed, not fresh. */
  minHealthySourceRate?: number;
  logger?: (message: string) => void;
}

export interface CollectResult {
  developments: Development[];
  reviewCandidates: SourceReview[];
  state: WatchState;
  meta: CollectionMeta;
  errors: string[];
}

export function collectionRunFailed(
  health: CollectionHealthStatus,
  errors: readonly string[],
  targeted: boolean,
): boolean {
  return health === 'failed' || (targeted && errors.length > 0);
}

const DEFAULT_MAX_ITEMS_PER_SOURCE = 5;
const DEFAULT_MIN_SCORE_FOR_DEVELOPMENT = 0.5;
const DEFAULT_MIN_SCORE_FOR_REVIEW = 0.7;
const DEFAULT_MIN_HEALTHY_SOURCE_RATE = 0.8;
const MAX_CANDIDATE_ATTEMPTS = 5;
const WEEKLY_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
/** Browser retrieval covers cold start plus challenge settling. */
const BROWSER_RETRIEVAL_TIMEOUT_MS = 60_000;

/** Allow-list and homepage-redirect failures are not client-dependent. */
function isBrowserFallbackFutile(error: unknown): boolean {
  return (
    error instanceof SourceFetchError &&
    error.code === 'destination_mismatch'
  );
}

export function emptyWatchState(): WatchState {
  return { seen: {}, lastCheckedBySource: {}, sourceSnapshots: {} };
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

function candidateStateKey(candidate: Candidate): string {
  const canonicalUrl = canonicalizeSourceUrl(candidate.url);
  if (!candidate.changeFingerprint) return canonicalUrl;
  const key = new URL(canonicalUrl);
  key.hash = `policai-change=${candidate.changeFingerprint}`;
  return key.toString();
}

function canonicalCandidate(candidate: Candidate): Candidate {
  const url = canonicalizeSourceUrl(candidate.url);
  return url === candidate.url ? candidate : { ...candidate, url };
}

function parseChangeFingerprint(
  value: string | undefined,
): { contentHash: string; changeCount: number } | null {
  if (!value) return null;
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return null;
  const contentHash = value.slice(0, separator);
  const changeCount = Number(value.slice(separator + 1));
  if (
    !/^[a-f0-9]{64}$/.test(contentHash) ||
    !Number.isInteger(changeCount) ||
    changeCount < 1
  ) {
    return null;
  }
  return { contentHash, changeCount };
}

function maximumChangeCountForSource(
  state: WatchState,
  sourceId: string,
): number {
  let maximum = state.sourceSnapshots[sourceId]?.changeCount ?? 0;
  for (const entry of Object.values(state.seen)) {
    if (entry.sourceId !== sourceId) continue;
    const parsed = parseChangeFingerprint(
      entry.candidate?.changeFingerprint,
    );
    if (parsed) maximum = Math.max(maximum, parsed.changeCount);
  }
  return maximum;
}

function latestDocumentTransition(
  state: WatchState,
  sourceId: string,
): {
  contentHash: string;
  changeCount: number;
  status: CandidateProcessingStatus | undefined;
} | null {
  let latest: {
    contentHash: string;
    changeCount: number;
    status: CandidateProcessingStatus | undefined;
  } | null = null;
  for (const entry of Object.values(state.seen)) {
    if (entry.sourceId !== sourceId) continue;
    const parsed = parseChangeFingerprint(
      entry.candidate?.changeFingerprint,
    );
    if (parsed && (!latest || parsed.changeCount > latest.changeCount)) {
      latest = { ...parsed, status: entry.status };
    }
  }
  return latest;
}

function transitionForDocumentHash(
  state: WatchState,
  sourceId: string,
  contentHash: string,
): { changeCount: number; isNew: boolean } {
  const latest = latestDocumentTransition(state, sourceId);
  const latestIsUnresolved =
    latest?.status === 'pending' ||
    latest?.status === 'awaiting_review' ||
    latest?.status === 'approved' ||
    latest?.status === 'failed';
  if (
    latest?.contentHash === contentHash &&
    (state.sourceSnapshots[sourceId]?.contentHash === contentHash ||
      latestIsUnresolved)
  ) {
    return { changeCount: latest.changeCount, isNew: false };
  }
  return {
    changeCount: maximumChangeCountForSource(state, sourceId) + 1,
    isNew: true,
  };
}

function hasUnresolvedDocumentTransition(
  state: WatchState,
  sourceId: string,
): boolean {
  return Object.values(state.seen).some(
    (entry) =>
      entry.sourceId === sourceId &&
      (entry.status === 'pending' ||
        entry.status === 'awaiting_review' ||
        entry.status === 'approved' ||
        entry.status === 'failed') &&
      Boolean(
        parseChangeFingerprint(entry.candidate?.changeFingerprint),
      ),
  );
}

function recoverPersistedDocumentTransitions(
  state: WatchState,
  reviews: readonly SourceReview[],
  sources: readonly WatchSource[],
): void {
  const sourceIdByUrl = new Map(
    sources.map((source) => [sourceUrlIdentity(source.url), source.id]),
  );
  for (const review of reviews) {
    const changeCount = review.sourceVersionSequence;
    const contentHash = review.sourceEvidence.contentHash;
    if (
      typeof changeCount !== 'number' ||
      !Number.isInteger(changeCount) ||
      changeCount < 1 ||
      !contentHash ||
      !/^[a-f0-9]{64}$/.test(contentHash)
    ) {
      continue;
    }
    const sourceId =
      review.linkedDevelopment?.sourceId ??
      sourceIdByUrl.get(sourceUrlIdentity(review.sourceUrl));
    if (!sourceId) continue;
    const candidate: Candidate = {
      title: review.title,
      url: review.sourceUrl,
      text: review.analysis.summary,
      changeFingerprint: `${contentHash}:${changeCount}`,
    };
    const key = candidateStateKey(candidate);
    const existing = state.seen[key];
    if (review.status === 'pending_review' && existing) {
      if (existing.status === 'processed') {
        state.seen[key] = {
          ...existing,
          status: 'awaiting_review',
          processedAt: undefined,
          candidate,
        };
      }
      continue;
    }

    const processedAt =
      review.publishedAt ?? review.reviewedAt ?? review.updatedAt;
    state.seen[key] = {
      ...existing,
      firstSeenAt: existing?.firstSeenAt ?? review.discoveredAt,
      sourceId,
      status:
        review.status === 'pending_review'
          ? 'pending'
          : review.status === 'approved'
            ? 'approved'
          : review.status === 'rejected'
            ? 'dismissed'
            : 'processed',
      processedAt:
        review.status === 'pending_review' || review.status === 'approved'
          ? undefined
          : processedAt,
      candidate,
    };
    if (review.status !== 'pending_review') {
      delete state.seen[key].lastError;
    }

    if (review.status !== 'approved' && review.status !== 'published') {
      continue;
    }
    const previous = state.sourceSnapshots[sourceId];
    const previousChangeCount = previous?.changeCount ?? 0;
    const canAdvanceSnapshot =
      changeCount > previousChangeCount ||
      (changeCount === previousChangeCount &&
        previous?.contentHash === contentHash);
    if (!canAdvanceSnapshot) continue;

    const checkedAt = review.sourceEvidence.retrievedAt ?? processedAt;
    state.sourceSnapshots[sourceId] = {
      contentHash,
      firstCheckedAt: previous?.firstCheckedAt ?? checkedAt,
      lastCheckedAt: checkedAt,
      lastChangedAt: review.reviewedAt ?? processedAt,
      changeCount,
    };
    const previousSourceCheck = state.lastCheckedBySource[sourceId];
    if (
      !previousSourceCheck ||
      new Date(checkedAt).getTime() >=
        new Date(previousSourceCheck).getTime()
    ) {
      state.lastCheckedBySource[sourceId] = checkedAt;
    }
  }
}

function supersedeOlderDocumentCandidates(
  state: WatchState,
  sourceId: string,
  changeCount: number,
  nowIso: string,
): void {
  for (const [key, entry] of Object.entries(state.seen)) {
    if (entry.sourceId !== sourceId) continue;
    const parsed = parseChangeFingerprint(
      entry.candidate?.changeFingerprint,
    );
    if (
      parsed &&
      parsed.changeCount < changeCount &&
      (entry.status === 'pending' ||
        entry.status === 'awaiting_review' ||
        entry.status === 'approved' ||
        entry.status === 'failed')
    ) {
      state.seen[key] = {
        ...entry,
        status: 'dismissed',
        processedAt: nowIso,
        lastError: `Superseded by source transition ${changeCount}`,
      };
    }
  }
}

function upsertDevelopmentResult(
  developments: Development[],
  development: Development,
): void {
  const index = developments.findIndex(
    (candidate) => candidate.id === development.id,
  );
  if (index === -1) developments.push(development);
  else developments[index] = development;
}

function upsertReviewResult(
  reviews: SourceReview[],
  review: SourceReview,
): void {
  const index = reviews.findIndex(
    (candidate) => candidate.id === review.id,
  );
  if (index === -1) reviews.push(review);
  else reviews[index] = review;
}

function retainFirstDiscovery(
  development: Development,
  existing: Development | undefined,
): Development {
  if (!existing || !sourceUrlsEqual(existing.url, development.url)) {
    return development;
  }
  return {
    ...development,
    detectedAt: existing.detectedAt,
  };
}

function isTrackedCandidate(
  candidate: Candidate,
  trackedUrls: Set<string>,
): boolean {
  return (
    !candidate.changeFingerprint &&
    trackedUrls.has(sourceUrlIdentity(candidate.url))
  );
}

function headlineIdentity(title: string): string {
  return title
    .split(/\s+\|\s+/, 1)[0]
    .toLowerCase()
    .replace(/^government\s+(?:sets|announces|launches|releases)\s+/, '')
    .replace(/^whole[-\s]+of[-\s]+government\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function headlineMonthKey(
  title: string,
  publishedAt: string | undefined,
  fallbackDate: string,
): string | null {
  const identity = headlineIdentity(title);
  if (identity.length < 12) return null;
  const month = (publishedAt ?? fallbackDate).slice(0, 7);
  return `${identity}:${month}`;
}

function candidateHeadlineKey(
  candidate: Candidate,
  fallbackDate: string,
): string | null {
  if (candidate.changeFingerprint) return null;
  return headlineMonthKey(candidate.title, candidate.dateHint, fallbackDate);
}

function isSourceDue(
  source: WatchSource,
  state: WatchState,
  now: Date,
): boolean {
  if (source.schedule === 'daily') return true;
  const lastChecked = state.lastCheckedBySource[source.id];
  if (!lastChecked) return true;
  return now.getTime() - new Date(lastChecked).getTime() >= WEEKLY_INTERVAL_MS;
}

function isPending(entry: SeenCandidate): boolean {
  return entry.status === 'pending';
}

function pendingCandidatesForSource(
  state: WatchState,
  sourceId: string,
): Candidate[] {
  return Object.values(state.seen)
    .filter(
      (entry) =>
        entry.sourceId === sourceId && isPending(entry) && entry.candidate,
    )
    .sort((a, b) => {
      const attemptDifference = (a.attempts ?? 0) - (b.attempts ?? 0);
      if (attemptDifference !== 0) return attemptDifference;
      return (a.lastAttemptAt ?? a.firstSeenAt).localeCompare(
        b.lastAttemptAt ?? b.firstSeenAt,
      );
    })
    .map((entry) => canonicalCandidate(entry.candidate as Candidate));
}

function sourceEvidence(
  evidence: SourceEvidence,
  candidate: Candidate,
): SourceEvidence {
  const canonicalEvidence = canonicalizeSourceEvidence(evidence);
  return {
    ...canonicalEvidence,
    title: candidate.title,
    publishedAt: candidate.dateHint,
    publishedAtPrecision: candidate.dateHintPrecision,
  };
}

function buildDevelopment(
  candidate: Candidate,
  source: WatchSource,
  classification: Classification,
  evidence: SourceEvidence,
  nowIso: string,
): Development {
  candidate = canonicalCandidate(candidate);
  const verificationSource = sourceEvidence(evidence, candidate);
  const identity = candidate.changeFingerprint
    ? `${candidate.url}:${candidate.changeFingerprint}`
    : candidate.url;
  return {
    id: `dev-${slugify(candidate.title, 48) || 'item'}-${hashUrl(identity)}`,
    title: candidate.title,
    url: candidate.url,
    sourceId: source.id,
    sourceName: source.name,
    jurisdiction: classification.suggestedJurisdiction ?? source.jurisdiction,
    publishedAt: candidate.dateHint,
    publishedAtPrecision: candidate.dateHintPrecision,
    detectedAt: nowIso,
    summary: classification.summary,
    relevanceScore: Number(classification.relevanceScore.toFixed(2)),
    classification: classification.classification,
    assessment: {
      ...classification.assessment,
      assessedAt: nowIso,
    },
    verification: {
      status: 'needs_review',
      source: verificationSource,
    },
    status: 'detected',
  };
}

function buildReviewCandidate(
  development: Development,
  candidate: Candidate,
  source: WatchSource,
  classification: Classification,
  evidence: SourceEvidence,
  nowIso: string,
  existingPolicy?: Policy,
): SourceReview {
  candidate = canonicalCandidate(candidate);
  let proposedRecord: PolicyDraft;
  if (existingPolicy) {
    const currentRecord: Partial<Policy> = { ...existingPolicy };
    delete currentRecord.verification;
    delete currentRecord.lastReviewedAt;
    proposedRecord = {
      ...(currentRecord as PolicyDraft),
      updatedAt: nowIso,
    };
  } else {
    proposedRecord = {
      id: slugify(candidate.title) || development.id,
      title: candidate.title,
      description: classification.summary || candidate.text,
      jurisdiction: development.jurisdiction,
      type: normalizePolicyType(classification.suggestedType),
      status: 'active',
      effectiveDate: candidate.dateHint,
      dates: candidate.dateHint
        ? [
            {
              type: 'published',
              date: candidate.dateHint,
              precision: candidate.dateHintPrecision ?? 'day',
              primary: true,
              source: sourceEvidence(evidence, candidate),
            },
          ]
        : undefined,
      agencies: classification.agencies,
      sourceUrl: candidate.url,
      content: candidate.text,
      aiSummary: classification.summary || '',
      tags: classification.tags,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  return {
    id: `source-review-${development.id}`,
    sourceUrl: candidate.url,
    title: candidate.title,
    entryKind: 'policy',
    targetPolicyId: existingPolicy?.id,
    ...(existingPolicy
      ? {
          targetPolicyBaseRevisionHash:
            policyRevisionHash(existingPolicy),
        }
      : {}),
    status: 'pending_review',
    discoveredAt: nowIso,
    createdBy: 'collector',
    notes: existingPolicy
      ? `${classification.summary} Re-verify the existing register record before restoring it to public reads. Detected by ${source.name} (${development.classification} assessment).`
      : `Detected by the collector from ${source.name} (score ${development.relevanceScore}, ${development.classification}).`,
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
    sourceEvidence: sourceEvidence(evidence, candidate),
    proposedRecord,
    linkedDevelopment: development,
    ...(existingPolicy && candidate.changeFingerprint
      ? {
          sourceVersionSequence:
            parseChangeFingerprint(candidate.changeFingerprint)?.changeCount,
        }
      : {}),
    updatedAt: nowIso,
  };
}

function changedDocumentReviewSummary(
  policy: Policy,
  reason: 'changed' | 'baseline_missing' | 'baseline_reversion',
): string {
  if (reason === 'baseline_missing') {
    return `The verified register record for "${policy.title}" has no stored source fingerprint. The currently served document requires editorial comparison before it can establish a trusted baseline.`;
  }
  if (reason === 'baseline_reversion') {
    return `The official source for "${policy.title}" returned to the last verified fingerprint after an unresolved changed version. Editorial confirmation is required before the obsolete update can be retired and public access restored.`;
  }
  return `The official source content for "${policy.title}" changed. Editorial re-verification is required before the register record can be treated as current.`;
}

function buildChangedDocumentReview(
  policy: Policy,
  source: WatchSource,
  evidence: SourceEvidence,
  contentHash: string,
  changeCount: number,
  nowIso: string,
  reason: 'changed' | 'baseline_missing' | 'baseline_reversion' = 'changed',
): {
  candidate: Candidate;
  development: Development;
  review: SourceReview;
} {
  const candidate: Candidate = {
    title: policy.title,
    url: canonicalizeSourceUrl(source.url),
    text: policy.description,
    changeFingerprint: `${contentHash}:${changeCount}`,
  };
  const summary = changedDocumentReviewSummary(policy, reason);
  const classification: Classification = {
    isRelevant: true,
    relevanceScore: 1,
    classification: 'heuristic',
    summary,
    suggestedType: policy.type,
    suggestedJurisdiction: policy.jurisdiction,
    tags: policy.tags,
    agencies: policy.agencies,
    assessment: {
      method: 'heuristic',
      promptVersion: 'source-hash-change-v1',
    },
  };
  const development = buildDevelopment(
    candidate,
    source,
    classification,
    evidence,
    nowIso,
  );
  return {
    candidate,
    development,
    review: buildReviewCandidate(
      development,
      candidate,
      source,
      classification,
      evidence,
      nowIso,
      policy,
    ),
  };
}

function changedTimelineDocumentReviewSummary(
  event: TimelineEvent,
  reason: 'changed' | 'baseline_missing' | 'baseline_reversion',
): string {
  if (reason === 'baseline_missing') {
    return `The verified timeline event for "${event.title}" has no stored source fingerprint. The currently served document requires editorial comparison before it can establish a trusted baseline.`;
  }
  if (reason === 'baseline_reversion') {
    return `The official source for "${event.title}" returned to the last verified fingerprint after an unresolved changed version. Editorial confirmation is required before the obsolete update can be retired.`;
  }
  return `The official source content for "${event.title}" changed. Editorial re-verification is required before the timeline event can be treated as current.`;
}

function buildChangedTimelineDocumentReview(
  event: TimelineEvent,
  source: WatchSource,
  evidence: SourceEvidence,
  contentHash: string,
  changeCount: number,
  nowIso: string,
  reason: 'changed' | 'baseline_missing' | 'baseline_reversion' = 'changed',
): {
  candidate: Candidate;
  development: Development;
  review: SourceReview;
} {
  const candidate: Candidate = {
    title: event.title,
    url: canonicalizeSourceUrl(source.url),
    text: event.description,
    changeFingerprint: `${contentHash}:${changeCount}`,
  };
  const summary = changedTimelineDocumentReviewSummary(event, reason);
  const classification: Classification = {
    isRelevant: true,
    relevanceScore: 1,
    classification: 'heuristic',
    summary,
    suggestedType: undefined,
    suggestedJurisdiction: event.jurisdiction,
    tags: [],
    agencies: [],
    assessment: {
      method: 'heuristic',
      promptVersion: 'source-hash-change-v1',
    },
  };
  const development = buildDevelopment(
    candidate,
    source,
    classification,
    evidence,
    nowIso,
  );
  const currentRecord: Partial<TimelineEvent> = { ...event };
  delete currentRecord.verification;

  return {
    candidate,
    development,
    review: {
      id: `source-review-${development.id}`,
      sourceUrl: candidate.url,
      title: candidate.title,
      entryKind: 'timeline_event',
      targetTimelineEventId: event.id,
      targetTimelineRevisionHash: timelineRevisionHash(event),
      sourceVersionSequence: changeCount,
      status: 'pending_review',
      discoveredAt: nowIso,
      createdBy: 'collector',
      notes: `${summary} Re-verify the existing timeline event before treating it as current. Detected by ${source.name} (${development.classification} assessment).`,
      analysis: {
        isRelevant: true,
        relevanceScore: 1,
        suggestedType: null,
        suggestedJurisdiction: event.jurisdiction,
        summary,
        tags: [],
        agencies: [],
      },
      sourceEvidence: sourceEvidence(evidence, candidate),
      proposedRecord: {
        ...(currentRecord as TimelineEventDraft),
      },
      linkedDevelopment: development,
      updatedAt: nowIso,
    },
  };
}

function selectCandidatesForRun(
  pending: Candidate[],
  fresh: Candidate[],
  maxItems: number,
): Candidate[] {
  if (maxItems <= 0) return [];
  if (pending.length === 0) return fresh.slice(0, maxItems);
  if (fresh.length === 0) return pending.slice(0, maxItems);

  const retrySlots = 1;
  const selectedFresh = fresh.slice(0, maxItems - retrySlots);
  const selectedPending = pending.slice(
    0,
    maxItems - selectedFresh.length,
  );
  const remainingCapacity =
    maxItems - selectedFresh.length - selectedPending.length;

  return [
    ...selectedFresh,
    ...selectedPending,
    ...fresh.slice(
      selectedFresh.length,
      selectedFresh.length + remainingCapacity,
    ),
  ];
}

function healthForRun(
  sourceResults: SourceRunResult[],
  sources: WatchSource[],
  minHealthySourceRate: number,
): {
  status: CollectionHealthStatus;
  dueSourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  skippedSourceCount: number;
  successRate: number;
} {
  const coverageResults = sourceResults.filter(
    (result) => result.coverageEligible !== false,
  );
  const successfulSourceCount = coverageResults.filter(
    (result) => result.status === 'success',
  ).length;
  const failedSourceCount = coverageResults.filter(
    (result) => result.status === 'error',
  ).length;
  const skippedSourceCount = sourceResults.filter(
    (result) => result.status === 'skipped',
  ).length;
  const dueSourceCount = successfulSourceCount + failedSourceCount;
  const successRate =
    dueSourceCount === 0 ? 1 : successfulSourceCount / dueSourceCount;
  const criticalSourceIds = new Set(
    sources.filter((source) => source.critical).map((source) => source.id),
  );
  const criticalFailure = coverageResults.some(
    (result) =>
      result.status === 'error' && criticalSourceIds.has(result.sourceId),
  );
  const retryFailure = sourceResults.some(
    (result) =>
      result.coverageEligible === false && result.status === 'error',
  );

  let status: CollectionHealthStatus = 'healthy';
  if (criticalFailure || successRate < minHealthySourceRate) {
    status = 'failed';
  } else if (failedSourceCount > 0 || retryFailure) {
    status = 'degraded';
  }

  return {
    status,
    dueSourceCount,
    successfulSourceCount,
    failedSourceCount,
    skippedSourceCount,
    successRate,
  };
}

function markPending(
  state: WatchState,
  candidate: Candidate,
  source: WatchSource,
  nowIso: string,
): void {
  const normalizedCandidate = canonicalCandidate(candidate);
  const key = candidateStateKey(normalizedCandidate);
  const existing = state.seen[key];
  state.seen[key] = {
    firstSeenAt: existing?.firstSeenAt ?? nowIso,
    sourceId: source.id,
    status: 'pending',
    attempts: existing?.attempts ?? 0,
    lastAttemptAt: existing?.lastAttemptAt,
    processedAt: existing?.processedAt,
    lastError: existing?.lastError,
    candidate: normalizedCandidate,
  };
}

function markCandidateAttempt(
  state: WatchState,
  candidate: Candidate,
  nowIso: string,
): SeenCandidate {
  const normalizedCandidate = canonicalCandidate(candidate);
  const key = candidateStateKey(normalizedCandidate);
  const entry = state.seen[key];
  const next: SeenCandidate = {
    ...entry,
    firstSeenAt: entry?.firstSeenAt ?? nowIso,
    sourceId: entry?.sourceId ?? '',
    status: 'pending',
    attempts: (entry?.attempts ?? 0) + 1,
    lastAttemptAt: nowIso,
    candidate: normalizedCandidate,
  };
  state.seen[key] = next;
  return next;
}

function markCandidateComplete(
  state: WatchState,
  candidate: Candidate,
  status: 'processed' | 'dismissed',
  nowIso: string,
): void {
  const normalizedCandidate = canonicalCandidate(candidate);
  const key = candidateStateKey(normalizedCandidate);
  state.seen[key] = {
    ...state.seen[key],
    status,
    processedAt: nowIso,
    lastError: undefined,
    candidate: normalizedCandidate,
  };
}

function markCandidateFailed(
  state: WatchState,
  candidate: Candidate,
  nowIso: string,
  error: string,
): void {
  const normalizedCandidate = canonicalCandidate(candidate);
  const key = candidateStateKey(normalizedCandidate);
  state.seen[key] = {
    ...state.seen[key],
    status: 'failed',
    processedAt: nowIso,
    lastError: error,
    candidate: normalizedCandidate,
  };
}

function sourceResult(
  sourceId: string,
  status: SourceRunResult['status'],
  checkedAt: string,
  startedAt: number,
  itemCount: number | null,
  candidateCount: number,
  newCandidateCount: number,
  error?: string,
  coverageEligible = true,
): SourceRunResult {
  return {
    sourceId,
    status,
    coverageEligible,
    checkedAt,
    durationMs: Math.max(0, Date.now() - startedAt),
    itemCount,
    candidateCount,
    newCandidateCount,
    error,
  };
}

/**
 * Run one collection pass over the watch sources.
 *
 * Pure with respect to disk I/O: callers provide state and persist the result.
 * Retryable candidate failures are bounded. Permanent or exhausted failures
 * remain in watch state for auditability but do not consume future run slots.
 */
export async function collect(options: CollectOptions): Promise<CollectResult> {
  const sources = options.sources ?? getAutomaticSources();
  const catalogSources = options.catalogSources ?? WATCH_SOURCES;
  const fetchImpl = options.fetchImpl;
  const now = options.now ? options.now() : new Date();
  const nowIso = now.toISOString();
  const log = options.logger ?? (() => {});
  const maxItemsPerSource =
    options.maxItemsPerSource ?? DEFAULT_MAX_ITEMS_PER_SOURCE;
  const minScoreForDevelopment =
    options.minScoreForDevelopment ?? DEFAULT_MIN_SCORE_FOR_DEVELOPMENT;
  const minScoreForReview =
    options.minScoreForReview ?? DEFAULT_MIN_SCORE_FOR_REVIEW;
  const minHealthySourceRate =
    options.minHealthySourceRate ?? DEFAULT_MIN_HEALTHY_SOURCE_RATE;

  const state: WatchState = {
    seen: { ...options.state.seen },
    lastCheckedBySource: { ...options.state.lastCheckedBySource },
    sourceSnapshots: { ...(options.state.sourceSnapshots ?? {}) },
  };
  recoverPersistedDocumentTransitions(
    state,
    options.sourceReviews ?? [],
    catalogSources,
  );
  const knownPublishedUrls = new Set([
    ...options.existingDevelopments.map((development) =>
      sourceUrlIdentity(development.url),
    ),
    ...(options.trackedUrls ?? []).map(sourceUrlIdentity),
  ]);
  const knownHeadlineKeys = new Set(
    options.existingDevelopments
      .map((development) =>
        headlineMonthKey(
          development.title,
          development.publishedAt,
          development.detectedAt,
        ),
      )
      .filter((value): value is string => Boolean(value)),
  );
  const trackedPoliciesByUrl = new Map(
    (options.trackedPolicies ?? []).map((policy) => [
      sourceUrlIdentity(policy.sourceUrl),
      policy,
    ]),
  );
  const trackedTimelineEventsByUrl = new Map(
    (options.trackedTimelineEvents ?? []).map((event) => [
      sourceUrlIdentity(event.sourceUrl),
      event,
    ]),
  );
  const existingDevelopmentsById = new Map(
    options.existingDevelopments.map((development) => [
      development.id,
      development,
    ]),
  );
  const existingReviewsById = new Map(
    (options.sourceReviews ?? []).map((review) => [review.id, review]),
  );

  const developments: Development[] = [];
  const reviewCandidates: SourceReview[] = [];
  const errors: string[] = [];
  const sourceResults: SourceRunResult[] = [];

  const browserFetchImpl = options.browserFetchImpl;

  for (const source of sources) {
    const startedAt = Date.now();
    const preferBrowser =
      source.fetchStrategy === 'browser' && Boolean(browserFetchImpl);
    const retrievePageWithFallback = async (
      url: string,
    ): Promise<RetrievedSource> => {
      if (preferBrowser) {
        return retrieveSource(url, {
          fetchImpl: browserFetchImpl,
          now: () => now,
          timeoutMs: BROWSER_RETRIEVAL_TIMEOUT_MS,
        });
      }
      try {
        return await retrieveSource(url, { fetchImpl, now: () => now });
      } catch (error) {
        if (!browserFetchImpl || isBrowserFallbackFutile(error)) throw error;
        log(`[collect] ${source.id}: retrying ${url} with the browser retriever`);
        return retrieveSource(url, {
          fetchImpl: browserFetchImpl,
          now: () => now,
          timeoutMs: BROWSER_RETRIEVAL_TIMEOUT_MS,
        });
      }
    };
    let pending = pendingCandidatesForSource(state, source.id);
    for (const candidate of pending) {
      if (!isAllowedSourceHost(candidate.url)) {
        delete state.seen[candidateStateKey(candidate)];
        log(
          `[collect] ${source.id}: discarded unsafe pending URL ${candidate.url}`,
        );
      }
    }
    pending = pending.filter((candidate) =>
      isAllowedSourceHost(candidate.url),
    );
    const due = options.force || isSourceDue(source, state, now);

    if (!due && pending.length === 0) {
      log(`[collect] ${source.id}: not due yet, skipping`);
      sourceResults.push(
        sourceResult(
          source.id,
          'skipped',
          nowIso,
          startedAt,
          null,
          0,
          0,
          undefined,
          false,
        ),
      );
      continue;
    }

    let sourceRetrieval: RetrievedSource | null = null;
    let directDocument:
      | Awaited<ReturnType<typeof extractRetrievedDocument>>
      | null = null;
    let discovered: Candidate[] = [];
    let itemCount: number | null = null;
    let candidateCount = 0;
    let newCandidateCount = 0;
    let deferSourceSuccess = false;
    const sourceErrors: string[] = [];

    if (due) {
      try {
        const attemptIndexRetrieval = async (
          impl: typeof fetch | undefined,
          timeoutMs?: number,
        ) => {
          const retrieval = await retrieveSource(source.url, {
            fetchImpl: impl,
            now: () => now,
            hashLinkedDocuments: source.kind === 'document',
            ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          });
          const extracted =
            source.kind === 'document'
              ? null
              : source.kind === 'rss'
                ? extractFromRss(retrieval.body, source.url)
                : extractFromHtml(retrieval.body, source.url);
          return { retrieval, extracted };
        };
        let indexAttempt: Awaited<ReturnType<typeof attemptIndexRetrieval>>;
        if (preferBrowser) {
          indexAttempt = await attemptIndexRetrieval(
            browserFetchImpl,
            BROWSER_RETRIEVAL_TIMEOUT_MS,
          );
        } else {
          try {
            indexAttempt = await attemptIndexRetrieval(fetchImpl);
            if (
              browserFetchImpl &&
              indexAttempt.extracted?.itemCount === 0 &&
              !indexAttempt.extracted.feedValid
            ) {
              log(
                `[collect] ${source.id}: empty index, retrying with the browser retriever`,
              );
              indexAttempt = await attemptIndexRetrieval(
                browserFetchImpl,
                BROWSER_RETRIEVAL_TIMEOUT_MS,
              );
            }
          } catch (error) {
            if (!browserFetchImpl || isBrowserFallbackFutile(error)) {
              throw error;
            }
            log(
              `[collect] ${source.id}: retrying source with the browser retriever`,
            );
            indexAttempt = await attemptIndexRetrieval(
              browserFetchImpl,
              BROWSER_RETRIEVAL_TIMEOUT_MS,
            );
          }
        }
        sourceRetrieval = indexAttempt.retrieval;
        const indexExtraction = indexAttempt.extracted;
        if (source.kind === 'document') {
          itemCount = 1;
          const contentHash = sourceRetrieval.evidence.contentHash;
          if (!contentHash) {
            throw new Error('Document retrieval did not produce a content hash');
          }
          const previous = state.sourceSnapshots[source.id];
          const trackedPolicy = trackedPoliciesByUrl.get(
            sourceUrlIdentity(source.url),
          );
          const trackedTimelineEvent = trackedTimelineEventsByUrl.get(
            sourceUrlIdentity(source.url),
          );
          const canonicalContentHash = trackedPolicy
            ? trackedPolicy.verification.source.contentHash
            : trackedTimelineEvent?.verification.source.contentHash;
          const trackedRecord = trackedPolicy ?? trackedTimelineEvent;
          const reviewReason = trackedRecord
            ? !canonicalContentHash
              ? 'baseline_missing'
              : canonicalContentHash !== contentHash
                ? 'changed'
                : hasUnresolvedDocumentTransition(state, source.id)
                  ? 'baseline_reversion'
                  : null
            : null;

          if (trackedRecord && reviewReason) {
            const transition = transitionForDocumentHash(
              state,
              source.id,
              contentHash,
            );
            if (transition.isNew) {
              supersedeOlderDocumentCandidates(
                state,
                source.id,
                transition.changeCount,
                nowIso,
              );
            }
            const staged = trackedPolicy
              ? buildChangedDocumentReview(
                  trackedPolicy,
                  source,
                  sourceRetrieval.evidence,
                  contentHash,
                  transition.changeCount,
                  nowIso,
                  reviewReason,
                )
              : buildChangedTimelineDocumentReview(
                  trackedTimelineEvent as TimelineEvent,
                  source,
                  sourceRetrieval.evidence,
                  contentHash,
                  transition.changeCount,
                  nowIso,
                  reviewReason,
                );
            discovered = [staged.candidate];
            if (transition.isNew) {
              developments.push(staged.development);
              reviewCandidates.push(staged.review);
            }
            deferSourceSuccess = true;
          } else if (trackedRecord) {
            const changeCount = maximumChangeCountForSource(
              state,
              source.id,
            );
            state.sourceSnapshots[source.id] = {
              contentHash,
              firstCheckedAt: previous?.firstCheckedAt ?? nowIso,
              lastCheckedAt: nowIso,
              ...(previous?.lastChangedAt
                ? { lastChangedAt: previous.lastChangedAt }
                : {}),
              ...(previous && previous.contentHash !== contentHash
                ? { lastChangedAt: nowIso }
                : {}),
              changeCount,
            };
          } else if (!previous) {
            directDocument = await extractRetrievedDocument(
              sourceRetrieval,
              source.url,
              source.name,
            );
            state.sourceSnapshots[source.id] = {
              contentHash,
              firstCheckedAt: nowIso,
              lastCheckedAt: nowIso,
              changeCount: 0,
            };
          } else if (previous.contentHash === contentHash) {
            state.sourceSnapshots[source.id] = {
              ...previous,
              lastCheckedAt: nowIso,
            };
          } else {
            const transition = transitionForDocumentHash(
              state,
              source.id,
              contentHash,
            );
            const changeCount = transition.changeCount;
            if (transition.isNew) {
              supersedeOlderDocumentCandidates(
                state,
                source.id,
                changeCount,
                nowIso,
              );
            }
            directDocument = await extractRetrievedDocument(
              sourceRetrieval,
              source.url,
              source.name,
            );
            state.sourceSnapshots[source.id] = {
              ...previous,
              contentHash,
              lastCheckedAt: nowIso,
              lastChangedAt: nowIso,
              changeCount,
            };
            discovered = [{
              title: directDocument.title,
              url: canonicalizeSourceUrl(source.url),
              text: directDocument.text.slice(0, 600),
              dateHint: directDocument.publishedAt,
              dateHintPrecision: directDocument.publishedAtPrecision,
              changeFingerprint: `${contentHash}:${changeCount}`,
            }];
          }
        } else {
          if (!indexExtraction) {
            throw new Error('Index source retrieval produced no extraction');
          }
          itemCount = indexExtraction.itemCount;
          if (itemCount === 0 && !indexExtraction.feedValid) {
            throw new Error(
              'Source returned no extractable index or feed items',
            );
          }
          discovered = indexExtraction.candidates;
        }

        const unsafeCandidateCount = discovered.filter(
          (candidate) => !isAllowedSourceHost(candidate.url),
        ).length;
        if (unsafeCandidateCount > 0) {
          log(
            `[collect] ${source.id}: ignored ${unsafeCandidateCount} candidate URL${unsafeCandidateCount === 1 ? '' : 's'} outside the official-source allow-list`,
          );
        }
        discovered = discovered.filter((candidate) =>
          isAllowedSourceHost(candidate.url),
        );
        candidateCount = discovered.length;
        if (source.kind === 'document') {
          const terminalDocumentFailures = discovered.filter(
            (candidate) =>
              state.seen[candidateStateKey(candidate)]?.status === 'failed',
          );
          if (terminalDocumentFailures.length > 0) {
            const message = `${source.id}: ${terminalDocumentFailures.length} document version${terminalDocumentFailures.length === 1 ? '' : 's'} remain unreadable after retry exhaustion; manual review is required`;
            sourceErrors.push(message);
            errors.push(message);
            deferSourceSuccess = true;
            log(`[collect] FAILED ${message}`);
          }
        }
        const fresh = discovered
          .filter((candidate) => {
            const key = candidateStateKey(candidate);
            return (
              !isTrackedCandidate(candidate, knownPublishedUrls) &&
              !knownHeadlineKeys.has(candidateHeadlineKey(candidate, nowIso) ?? '') &&
              !state.seen[key]
            );
          });

        for (const candidate of fresh) {
          newCandidateCount++;
          markPending(state, candidate, source, nowIso);
        }
        discovered = fresh;
        if (!deferSourceSuccess && sourceErrors.length === 0) {
          state.lastCheckedBySource[source.id] = nowIso;
        }
      } catch (error) {
        const message = `${source.id}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        sourceErrors.push(message);
        errors.push(message);
        log(`[collect] FAILED ${message}`);
      }
    }

    for (const candidate of pending) {
      if (
        isTrackedCandidate(candidate, knownPublishedUrls) ||
        knownHeadlineKeys.has(candidateHeadlineKey(candidate, nowIso) ?? '')
      ) {
        markCandidateComplete(state, candidate, 'dismissed', nowIso);
      }
    }
    const candidates = selectCandidatesForRun(
      pending.filter(
        (candidate) =>
          state.seen[candidateStateKey(candidate)]?.status === 'pending' &&
          !isTrackedCandidate(candidate, knownPublishedUrls) &&
          !knownHeadlineKeys.has(candidateHeadlineKey(candidate, nowIso) ?? ''),
      ),
      discovered,
      maxItemsPerSource,
    );
    log(
      `[collect] ${source.id}: ${candidateCount} candidates, ${newCandidateCount} new, ${pending.length} pending`,
    );

    let candidateFailureCount = 0;
    for (const candidate of candidates) {
      const headlineKey = candidateHeadlineKey(candidate, nowIso);
      if (headlineKey && knownHeadlineKeys.has(headlineKey)) {
        markCandidateComplete(state, candidate, 'dismissed', nowIso);
        continue;
      }
      const attempted = markCandidateAttempt(state, candidate, nowIso);

      let pageRetrieval: RetrievedSource;
      let document: Awaited<ReturnType<typeof extractRetrievedDocument>>;
      let existingPolicy: Policy | undefined;
      let existingTimelineEvent: TimelineEvent | undefined;
      try {
        pageRetrieval =
          source.kind === 'document' &&
          sourceUrlsEqual(candidate.url, source.url) &&
          sourceRetrieval
            ? sourceRetrieval
            : await retrievePageWithFallback(candidate.url);
        existingPolicy = candidate.changeFingerprint
          ? trackedPoliciesByUrl.get(sourceUrlIdentity(candidate.url))
          : undefined;
        existingTimelineEvent = candidate.changeFingerprint && !existingPolicy
          ? trackedTimelineEventsByUrl.get(sourceUrlIdentity(candidate.url))
          : undefined;
        const expectedVersion = parseChangeFingerprint(
          candidate.changeFingerprint,
        );
        if (source.kind === 'document' && expectedVersion) {
          const actualHash = pageRetrieval.evidence.contentHash;
          if (actualHash !== expectedVersion.contentHash) {
            const transition = actualHash
              ? transitionForDocumentHash(
                  state,
                  source.id,
                  actualHash,
                )
              : null;
            if (
              existingPolicy &&
              actualHash &&
              transition?.isNew
            ) {
              supersedeOlderDocumentCandidates(
                state,
                source.id,
                transition.changeCount,
                nowIso,
              );
              const staged = buildChangedDocumentReview(
                existingPolicy,
                source,
                pageRetrieval.evidence,
                actualHash,
                transition.changeCount,
                nowIso,
                actualHash ===
                  existingPolicy.verification.source.contentHash
                  ? 'baseline_reversion'
                  : 'changed',
              );
              markPending(state, staged.candidate, source, nowIso);
              upsertDevelopmentResult(
                developments,
                staged.development,
              );
              upsertReviewResult(reviewCandidates, staged.review);
              candidateCount++;
              newCandidateCount++;
            }
            throw new SourceFetchError(
              'Document content changed before the pending version could be processed',
              { retryable: true },
            );
          }
        }
        document =
          source.kind === 'document' &&
          sourceUrlsEqual(candidate.url, source.url) &&
          directDocument
            ? directDocument
            : await extractRetrievedDocument(
                pageRetrieval,
                candidate.url,
                candidate.title,
              );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const key = candidateStateKey(candidate);
        if (state.seen[key]?.status === 'dismissed') {
          log(
            `[collect] ${source.id}: superseded ${candidate.url} (${message})`,
          );
          continue;
        }
        candidateFailureCount++;
        const terminal =
          (error instanceof SourceFetchError && !error.retryable) ||
          (attempted.attempts ?? 0) >= MAX_CANDIDATE_ATTEMPTS;
        if (terminal) {
          markCandidateFailed(state, candidate, nowIso, message);
          log(`[collect] ${source.id}: failed ${candidate.url} (${message})`);
        } else {
          state.seen[key] = {
            ...state.seen[key],
            status: 'pending',
            lastError: message,
            candidate,
          };
          log(`[collect] ${source.id}: pending ${candidate.url} (${message})`);
        }
        continue;
      }

      const enrichedCandidate: Candidate = {
        ...candidate,
        title:
          existingPolicy?.title ||
          existingTimelineEvent?.title ||
          document.title ||
          candidate.title,
        text: document.text.slice(0, 600) || candidate.text,
        dateHint: document.publishedAt ?? candidate.dateHint,
        dateHintPrecision:
          document.publishedAtPrecision ??
          candidate.dateHintPrecision,
      };
      state.seen[candidateStateKey(candidate)].candidate = enrichedCandidate;
      if (
        source.kind === 'document' &&
        candidate.changeFingerprint &&
        (existingPolicy || existingTimelineEvent)
      ) {
        const contentHash = pageRetrieval.evidence.contentHash;
        const parsedFingerprint = parseChangeFingerprint(
          candidate.changeFingerprint,
        );
        if (!contentHash || !parsedFingerprint) {
          throw new Error(
            'Changed document did not retain a valid fingerprint',
          );
        }
        const previous = state.sourceSnapshots[source.id];
        state.sourceSnapshots[source.id] = {
          contentHash,
          firstCheckedAt: previous?.firstCheckedAt ?? nowIso,
          lastCheckedAt: nowIso,
          lastChangedAt: nowIso,
          changeCount: parsedFingerprint.changeCount,
        };
        state.lastCheckedBySource[source.id] = nowIso;
      }

      const initialClassification = await classifyCandidate(
        enrichedCandidate,
        document.text,
      );
      const classification: Classification = existingPolicy
        ? {
            ...initialClassification,
            isRelevant: true,
            relevanceScore: 1,
            summary: changedDocumentReviewSummary(
              existingPolicy,
              !existingPolicy.verification.source.contentHash
                ? 'baseline_missing'
                : pageRetrieval.evidence.contentHash ===
                    existingPolicy.verification.source.contentHash
                  ? 'baseline_reversion'
                  : 'changed',
            ),
            suggestedType: existingPolicy.type,
            suggestedJurisdiction: existingPolicy.jurisdiction,
            tags: existingPolicy.tags,
            agencies: existingPolicy.agencies,
          }
        : existingTimelineEvent
          ? {
              ...initialClassification,
              isRelevant: true,
              relevanceScore: 1,
              summary: changedTimelineDocumentReviewSummary(
                existingTimelineEvent,
                !existingTimelineEvent.verification.source.contentHash
                  ? 'baseline_missing'
                  : pageRetrieval.evidence.contentHash ===
                      existingTimelineEvent.verification.source.contentHash
                    ? 'baseline_reversion'
                    : 'changed',
              ),
              suggestedType: undefined,
              suggestedJurisdiction: existingTimelineEvent.jurisdiction,
              tags: [],
              agencies: [],
            }
        : initialClassification;
      if (
        !classification.isRelevant ||
        classification.relevanceScore < minScoreForDevelopment
      ) {
        markCandidateComplete(state, enrichedCandidate, 'dismissed', nowIso);
        continue;
      }

      let development = buildDevelopment(
        enrichedCandidate,
        source,
        classification,
        pageRetrieval.evidence,
        nowIso,
      );
      const priorReview = existingReviewsById.get(
        `source-review-${development.id}`,
      );
      development = retainFirstDiscovery(
        development,
        existingDevelopmentsById.get(development.id) ??
          priorReview?.linkedDevelopment,
      );
      upsertDevelopmentResult(developments, development);
      knownPublishedUrls.add(sourceUrlIdentity(development.url));
      if (headlineKey) knownHeadlineKeys.add(headlineKey);
      markCandidateComplete(state, enrichedCandidate, 'processed', nowIso);

      if (
        classification.classification === 'heuristic' ||
        classification.relevanceScore >= minScoreForReview
      ) {
        const parsedFingerprint = parseChangeFingerprint(
          enrichedCandidate.changeFingerprint,
        );
        let review = existingTimelineEvent && parsedFingerprint
          ? {
              ...buildChangedTimelineDocumentReview(
                existingTimelineEvent,
                source,
                pageRetrieval.evidence,
                parsedFingerprint.contentHash,
                parsedFingerprint.changeCount,
                nowIso,
                !existingTimelineEvent.verification.source.contentHash
                  ? 'baseline_missing'
                  : pageRetrieval.evidence.contentHash ===
                      existingTimelineEvent.verification.source.contentHash
                    ? 'baseline_reversion'
                    : 'changed',
              ).review,
              sourceEvidence: sourceEvidence(
                pageRetrieval.evidence,
                enrichedCandidate,
              ),
              linkedDevelopment: development,
            }
          : buildReviewCandidate(
              development,
              enrichedCandidate,
              source,
              classification,
              pageRetrieval.evidence,
              nowIso,
              existingPolicy,
            );
        const existingReview = existingReviewsById.get(review.id);
        if (
          existingReview &&
          existingReview.sourceVersionSequence ===
            review.sourceVersionSequence &&
          existingReview.sourceEvidence.contentHash ===
            review.sourceEvidence.contentHash
        ) {
          review = {
            ...review,
            discoveredAt: existingReview.discoveredAt,
            linkedDevelopment: review.linkedDevelopment
              ? retainFirstDiscovery(
                  review.linkedDevelopment,
                  existingReview.linkedDevelopment,
                )
              : review.linkedDevelopment,
          };
        }
        upsertReviewResult(reviewCandidates, review);
      }
    }

    if (candidateFailureCount > 0) {
      const message = `${source.id}: ${candidateFailureCount} candidate retrieval failure${
        candidateFailureCount === 1 ? '' : 's'
      }`;
      sourceErrors.push(message);
      errors.push(message);
    }
    sourceResults.push(
      sourceResult(
        source.id,
        sourceErrors.length > 0 ? 'error' : 'success',
        nowIso,
        startedAt,
        itemCount,
        candidateCount,
        newCandidateCount,
        sourceErrors.length > 0 ? sourceErrors.join('; ') : undefined,
        due,
      ),
    );
  }

  const runHealth = healthForRun(
    sourceResults,
    sources,
    minHealthySourceRate,
  );
  const checkedSources = sourceResults
    .filter((result) => result.status !== 'skipped')
    .map((result) => result.sourceId);
  const previousMeta = options.previousMeta;
  const meta: CollectionMeta = {
    lastCollectedAt: nowIso,
    lastHealthyAt:
      runHealth.status === 'healthy'
        ? nowIso
        : previousMeta?.lastHealthyAt ?? null,
    lastReviewedAt: previousMeta?.lastReviewedAt ?? null,
    collector: {
      runCount: (previousMeta?.collector.runCount ?? 0) + 1,
      lastRunSources: checkedSources,
      lastRunErrors: errors,
      health: runHealth.status,
      dueSourceCount: runHealth.dueSourceCount,
      successfulSourceCount: runHealth.successfulSourceCount,
      failedSourceCount: runHealth.failedSourceCount,
      skippedSourceCount: runHealth.skippedSourceCount,
      successRate: Number(runHealth.successRate.toFixed(3)),
      automaticSourceCount: catalogSources.filter(
        (source) => source.enabled && source.automation === 'automatic',
      ).length,
      manualSourceCount: catalogSources.filter(
        (source) => source.enabled && source.automation === 'manual',
      ).length,
      sourceResults,
    },
  };

  return { developments, reviewCandidates, state, meta, errors };
}
