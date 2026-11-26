import {
  isGateError,
  matchesRetrievedContent,
  retrieveSource,
  SourceFetchError,
  type RetrievedSource,
} from '@/lib/pipeline/fetch';
import { hostOf, type Host } from '@/lib/pipeline/host';
import { createHostGate, robotsFetcher, type HostGate } from '@/lib/pipeline/host-gate';
import { refusedHosts, WATCH_SOURCES } from '@/lib/pipeline/sources';
import { sourceUrlIdentity } from '@/lib/source-url';
import type {
  LinkedDocumentEvidence,
  Policy,
  SourceEvidence,
} from '@/types';

export type RegisterAuditStatus =
  | 'unchanged'
  | 'baseline_missing'
  | 'changed'
  | 'comparison_unavailable'
  | 'source_missing'
  | 'retrieval_failed';

export type RegisterAuditComparisonBasis =
  | 'content_hash'
  | 'linked_documents';

export interface RegisterAuditResult {
  policyId: string;
  title: string;
  sourceUrl: string;
  status: RegisterAuditStatus;
  checkedAt: string;
  previousHash?: string;
  currentEvidence?: SourceEvidence;
  comparisonBasis?: RegisterAuditComparisonBasis;
  httpStatus?: number;
  error?: string;
}

interface RegisterAuditOptions {
  concurrency?: number;
  sourceId?: string;
  retrieve?: (url: string) => Promise<RetrievedSource>;
  now?: () => Date;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  /** Environment overrides; defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Injectable backoff clock, primarily for tests. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Paces each host, applies robots.txt and refuses hosts decided refused. */
  gate?: HostGate;
}

interface EvidenceComparison {
  status: 'unchanged' | 'changed' | 'comparison_unavailable';
  basis?: RegisterAuditComparisonBasis;
  error?: string;
}

function linkedDocumentIdentity(
  document: LinkedDocumentEvidence,
): string {
  return sourceUrlIdentity(document.finalUrl ?? document.url);
}

/**
 * Compare exact linked-document bytes only when both evidence sets describe
 * the same document identities. This makes browser-capture composites
 * comparable with fresh server retrievals without treating their different
 * page-hash formats as policy changes.
 */
function compareLinkedDocuments(
  previous: readonly LinkedDocumentEvidence[] | undefined,
  current: readonly LinkedDocumentEvidence[] | undefined,
): EvidenceComparison | null {
  if (!previous?.length || !current?.length) return null;

  const previousByUrl = new Map(
    previous.map((document) => [
      linkedDocumentIdentity(document),
      document.contentHash,
    ]),
  );
  const currentByUrl = new Map(
    current.map((document) => [
      linkedDocumentIdentity(document),
      document.contentHash,
    ]),
  );
  if (
    previousByUrl.size !== currentByUrl.size ||
    [...previousByUrl.keys()].some((url) => !currentByUrl.has(url))
  ) {
    return {
      status: 'comparison_unavailable',
      error:
        'Stored and current evidence refer to different linked-document sets',
    };
  }

  const changed = [...previousByUrl].some(
    ([url, hash]) => currentByUrl.get(url) !== hash,
  );
  return {
    status: changed ? 'changed' : 'unchanged',
    basis: 'linked_documents',
  };
}

export function compareRegisterSourceEvidence(
  previous: SourceEvidence,
  current: Pick<RetrievedSource, 'evidence' | 'earlierContentHashes'>,
): EvidenceComparison {
  const linkedComparison = compareLinkedDocuments(
    previous.linkedDocuments,
    current.evidence.linkedDocuments,
  );
  const retrievalMethodsMatch =
    Boolean(previous.browserCapture) ===
    Boolean(current.evidence.browserCapture);

  if (!retrievalMethodsMatch) {
    return (
      linkedComparison ?? {
        status: 'comparison_unavailable',
        error:
          'Stored browser-capture evidence is not directly comparable with the current server-retrieval fingerprint',
      }
    );
  }

  if (!previous.contentHash || !current.evidence.contentHash) {
    return {
      status: 'comparison_unavailable',
      error: 'Comparable source evidence is missing a content fingerprint',
    };
  }
  return {
    status: matchesRetrievedContent(current, previous.contentHash)
      ? 'unchanged'
      : 'changed',
    basis: 'content_hash',
  };
}

/**
 * Register-audit retrieval defaults. Government hosts are frequently slow, so
 * the audit gives each attempt a generous deadline and performs exactly one
 * retry for transient failures (timeouts, DNS/socket errors, HTTP 408/429/5xx)
 * with a short backoff. Client errors such as HTTP 403 bot walls are never
 * retried, and a retried-then-failed source still reports `retrieval_failed`;
 * no failures are silently swallowed.
 *
 * Trade-off: the raised timeout roughly doubles the audit's wall-clock upper
 * bound for slow sources (2 attempts x 45s) and the 2026-09-24 sweep showed
 * most retrieval failures were 20s timeouts against slow hosts, not content
 * changes. `AUDIT_REGISTER_TIMEOUT_MS`, `AUDIT_REGISTER_ATTEMPTS` and
 * `AUDIT_REGISTER_RETRY_DELAY_MS` override the defaults for one run.
 */
export const AUDIT_REGISTER_DEFAULT_TIMEOUT_MS = 45_000;
export const AUDIT_REGISTER_DEFAULT_ATTEMPTS = 2;
export const AUDIT_REGISTER_DEFAULT_RETRY_DELAY_MS = 1_000;

function positiveIntegerEnv(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid audit register environment override: "${value}" must be a positive integer`,
    );
  }
  return parsed;
}

export function registerAuditRetrievalOptions(
  env: Record<string, string | undefined> = process.env,
): { timeoutMs: number; attempts: number; retryDelayMs: number } {
  const timeoutMs =
    positiveIntegerEnv(env.AUDIT_REGISTER_TIMEOUT_MS) ??
    AUDIT_REGISTER_DEFAULT_TIMEOUT_MS;
  const attempts =
    positiveIntegerEnv(env.AUDIT_REGISTER_ATTEMPTS) ??
    AUDIT_REGISTER_DEFAULT_ATTEMPTS;
  const retryDelayMs =
    positiveIntegerEnv(env.AUDIT_REGISTER_RETRY_DELAY_MS) ??
    AUDIT_REGISTER_DEFAULT_RETRY_DELAY_MS;
  return { timeoutMs, attempts, retryDelayMs };
}

const auditSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Register-record hosts that refuse the declared Policai identity but host no
 * watch source decided `identity_refused`. The audit does not request them;
 * their records go to full review. Remove an entry when a gated audit reads
 * the host again.
 */
export const AUDIT_REFUSED_HOSTS: Readonly<Record<string, string>> = {
  'www.anao.gov.au':
    'register audit 2026-11-26: HTTP/2 stream reset and no HTTP/1.1 response for the declared Policai identity; a plain curl user agent got HTTP 200 from Argus',
  'www.fcfcoa.gov.au':
    'register audit 2026-11-26: no HTTP/1.1 response within 15 s for the declared Policai identity; a plain curl user agent got HTTP 200 from Argus',
  'www.finance.gov.au':
    'register audit 2026-11-26: no HTTP/1.1 response within 15 s for the declared Policai identity; a plain curl user agent got HTTP 200 from Argus',
  'www.ag.gov.au':
    'register audit 2026-11-26: no HTTP/1.1 response within 15 s for the declared Policai identity; a plain curl user agent got HTTP 200 from Argus',
  'www.inslm.gov.au':
    'register audit 2026-11-26: no HTTP/1.1 response within 15 s for the declared Policai identity; a plain curl user agent got HTTP 200 from Argus',
};

/** The gate a register audit on the collector host runs through. */
export function createRegisterAuditGate(): HostGate {
  const refused = new Map<Host, string>(refusedHosts(WATCH_SOURCES));
  for (const host of Object.keys(AUDIT_REFUSED_HOSTS))
    if (!refused.has(host as Host)) refused.set(host as Host, 'AUDIT_REFUSED_HOSTS');
  return createHostGate({
    hosts: {},
    refused,
    fetchRobots: robotsFetcher(),
    now: Date.now,
    sleep: auditSleep,
  });
}

/**
 * Run one retrieval attempt, retrying exactly once for transient failures
 * (timeouts, DNS/socket errors, HTTP 408/429/5xx). Non-retryable errors —
 * HTTP 403, bot challenges, destination mismatches, and other client errors —
 * are rethrown immediately. A retried-then-failed source keeps reporting its
 * failure; nothing is silently swallowed.
 */
export async function retrieveWithAuditRetry(
  retrieve: (url: string) => Promise<RetrievedSource>,
  url: string,
  retryDelayMs: number,
  sleep: (milliseconds: number) => Promise<void> = auditSleep,
): Promise<RetrievedSource> {
  try {
    return await retrieve(url);
  } catch (firstError) {
    if (!(firstError instanceof SourceFetchError && firstError.retryable)) {
      throw firstError;
    }
    await sleep(Math.max(0, retryDelayMs));
    return await retrieve(url);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await run(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), items.length) },
      () => worker(),
    ),
  );
  return results;
}

/**
 * A record whose official source the audit can re-read: a register policy,
 * a timeline event, or a development under its `url`.
 */
export type AuditableRecord = Pick<Policy, 'id' | 'title' | 'sourceUrl' | 'verification'> & {
  status?: string;
};

export async function auditRegister(
  policies: readonly AuditableRecord[],
  options: RegisterAuditOptions = {},
): Promise<RegisterAuditResult[]> {
  const resolved = options.retrieve
    ? undefined
    : registerAuditRetrievalOptions(options.env);
  const retrieve: (url: string) => Promise<RetrievedSource> =
    options.retrieve ??
    ((url: string) =>
      retrieveSource(url, {
        // The retry lives in this module (retrieveWithAuditRetry), so custom
        // injected retrievers — including test fake fetches — retry identically.
        attempts: 1,
        timeoutMs: options.timeoutMs ?? resolved!.timeoutMs,
        gate: options.gate,
      }));
  const retryDelayMs =
    options.retryDelayMs ?? resolved?.retryDelayMs ?? AUDIT_REGISTER_DEFAULT_RETRY_DELAY_MS;
  const now = options.now ?? (() => new Date());
  const auditable = policies.filter(
    (policy) =>
      policy.status !== 'trashed' &&
      (!options.sourceId || policy.id === options.sourceId),
  );

  const auditOne = async (
    policy: AuditableRecord,
  ): Promise<{ result: RegisterAuditResult; error?: unknown }> => {
    try {
      const retrieved = await retrieveWithAuditRetry(
        retrieve,
        policy.sourceUrl,
        retryDelayMs,
        options.sleep,
      );
      const completedAt = now().toISOString();
      const retrievedAt = retrieved.evidence.retrievedAt;
      const checkedAt =
        retrievedAt &&
        Number.isFinite(new Date(retrievedAt).getTime()) &&
        new Date(retrievedAt).getTime() > new Date(completedAt).getTime()
          ? retrievedAt
          : completedAt;
      const previousHash = policy.verification.source.contentHash;
      const comparison = previousHash
        ? compareRegisterSourceEvidence(
            policy.verification.source,
            retrieved,
          )
        : null;
      const status: RegisterAuditStatus = comparison
        ? comparison.status
        : 'baseline_missing';
      return {
        result: {
          policyId: policy.id,
          title: policy.title,
          sourceUrl: policy.sourceUrl,
          status,
          checkedAt,
          previousHash,
          currentEvidence: retrieved.evidence,
          comparisonBasis: comparison?.basis,
          error: comparison?.error,
        },
      };
    } catch (error) {
      const checkedAt = now().toISOString();
      const httpStatus =
        error instanceof SourceFetchError ? error.status : undefined;
      const sourceMissing =
        httpStatus === 404 ||
        httpStatus === 410 ||
        (error instanceof SourceFetchError &&
          error.code === 'destination_mismatch');
      return {
        error,
        result: {
          policyId: policy.id,
          title: policy.title,
          sourceUrl: policy.sourceUrl,
          status: sourceMissing ? 'source_missing' : 'retrieval_failed',
          checkedAt,
          httpStatus,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };

  // One host's records run in order, so the gate paces each host and a host
  // that stops answering costs one timeout per audit, not one per record.
  const byHost = new Map<string, number[]>();
  auditable.forEach((policy, index) => {
    const host = URL.canParse(policy.sourceUrl)
      ? hostOf(new URL(policy.sourceUrl))
      : policy.sourceUrl;
    byHost.set(host, [...(byHost.get(host) ?? []), index]);
  });
  const results = new Array<RegisterAuditResult>(auditable.length);
  await mapWithConcurrency(
    [...byHost],
    options.concurrency ?? 4,
    async ([host, indexes]) => {
      let unanswered = false;
      for (const index of indexes) {
        const policy = auditable[index];
        if (unanswered) {
          results[index] = {
            policyId: policy.id,
            title: policy.title,
            sourceUrl: policy.sourceUrl,
            status: 'retrieval_failed',
            checkedAt: now().toISOString(),
            error: `${host} did not answer earlier in this audit; ${policy.sourceUrl} not requested`,
          };
          continue;
        }
        const { result, error } = await auditOne(policy);
        results[index] = result;
        unanswered = hostDidNotAnswer(error);
      }
    },
  );
  return results;
}

/** A timeout or socket failure that survived the retry, not an HTTP answer or a gate decision. */
function hostDidNotAnswer(error: unknown): boolean {
  return (
    error instanceof SourceFetchError &&
    error.retryable &&
    error.status === undefined &&
    !isGateError(error)
  );
}

export function applyRegisterAuditEvidence<T extends AuditableRecord>(
  policies: readonly T[],
  results: readonly RegisterAuditResult[],
): T[] {
  const resultById = new Map(results.map((result) => [result.policyId, result]));

  return policies.map((policy): T => {
    const result = resultById.get(policy.id);
    if (!result) return policy;

    if (result.status === 'source_missing') {
      const missingReason = result.httpStatus
        ? `returned HTTP ${result.httpStatus}`
        : `no longer resolves to the requested official document (${result.error ?? 'permanent destination mismatch'})`;
      const changeNote = `Register audit confirmed that the official source ${missingReason} at ${result.checkedAt}; editorial re-verification is required.`;
      return {
        ...policy,
        verification: {
          ...policy.verification,
          status: 'stale',
          lastSourceAuditAt: result.checkedAt,
          notes: policy.verification.notes?.includes(
            'Register audit confirmed that the official source',
          )
            ? policy.verification.notes
            : policy.verification.notes
              ? `${policy.verification.notes} ${changeNote}`
              : changeNote,
        },
      };
    }

    if (result.status === 'comparison_unavailable') return policy;

    if (!result.currentEvidence) return policy;

    // The stored source is the evidence for the version the editor reviewed;
    // an unchanged audit leaves it alone and records only when it checked.
    if (result.status === 'unchanged') {
      return {
        ...policy,
        verification: {
          ...policy.verification,
          lastSourceAuditAt: result.checkedAt,
        },
      };
    }

    const observedSource = {
      ...policy.verification.source,
      ...result.currentEvidence,
      url: policy.sourceUrl,
    };

    const changeNote =
      result.status === 'baseline_missing'
        ? `Register audit established the first source fingerprint at ${result.checkedAt} without an editorial content comparison; editorial re-verification is required.`
        : `Source content changed during register audit at ${result.checkedAt}; editorial re-verification is required.`;
    const notePrefix =
      result.status === 'baseline_missing'
        ? 'Register audit established the first source fingerprint'
        : 'Source content changed during register audit';
    return {
      ...policy,
      verification: {
        ...policy.verification,
        status: 'stale',
        source:
          result.status === 'baseline_missing'
            ? observedSource
            : policy.verification.source,
        lastSourceAuditAt: result.checkedAt,
        notes: policy.verification.notes?.includes(
          notePrefix,
        )
          ? policy.verification.notes
          : policy.verification.notes
            ? `${policy.verification.notes} ${changeNote}`
            : changeNote,
      },
    };
  });
}
