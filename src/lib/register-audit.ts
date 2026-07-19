import {
  retrieveSource,
  SourceFetchError,
  type RetrievedSource,
} from '@/lib/pipeline/fetch';
import type { Policy, SourceEvidence } from '@/types';

export type RegisterAuditStatus =
  | 'unchanged'
  | 'baseline_missing'
  | 'changed'
  | 'source_missing'
  | 'retrieval_failed';

export interface RegisterAuditResult {
  policyId: string;
  title: string;
  sourceUrl: string;
  status: RegisterAuditStatus;
  checkedAt: string;
  previousHash?: string;
  currentEvidence?: SourceEvidence;
  httpStatus?: number;
  error?: string;
}

interface RegisterAuditOptions {
  concurrency?: number;
  sourceId?: string;
  retrieve?: (url: string) => Promise<RetrievedSource>;
  now?: () => Date;
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

export async function auditRegister(
  policies: Policy[],
  options: RegisterAuditOptions = {},
): Promise<RegisterAuditResult[]> {
  const retrieve =
    options.retrieve ??
    ((url: string) =>
      retrieveSource(url, {
        attempts: 1,
        timeoutMs: 20_000,
      }));
  const now = options.now ?? (() => new Date());
  const auditable = policies.filter(
    (policy) =>
      policy.status !== 'trashed' &&
      (!options.sourceId || policy.id === options.sourceId),
  );

  return mapWithConcurrency(
    auditable,
    options.concurrency ?? 4,
    async (policy) => {
      try {
        const retrieved = await retrieve(policy.sourceUrl);
        const completedAt = now().toISOString();
        const retrievedAt = retrieved.evidence.retrievedAt;
        const checkedAt =
          retrievedAt &&
          Number.isFinite(new Date(retrievedAt).getTime()) &&
          new Date(retrievedAt).getTime() > new Date(completedAt).getTime()
            ? retrievedAt
            : completedAt;
        const previousHash = policy.verification.source.contentHash;
        const currentHash = retrieved.evidence.contentHash;
        const status: RegisterAuditStatus = !previousHash
          ? 'baseline_missing'
          : previousHash === currentHash
            ? 'unchanged'
            : 'changed';
        return {
          policyId: policy.id,
          title: policy.title,
          sourceUrl: policy.sourceUrl,
          status,
          checkedAt,
          previousHash,
          currentEvidence: retrieved.evidence,
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
          policyId: policy.id,
          title: policy.title,
          sourceUrl: policy.sourceUrl,
          status: sourceMissing ? 'source_missing' : 'retrieval_failed',
          checkedAt,
          httpStatus,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}

export function applyRegisterAuditEvidence(
  policies: Policy[],
  results: RegisterAuditResult[],
): Policy[] {
  const resultById = new Map(results.map((result) => [result.policyId, result]));

  return policies.map((policy) => {
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

    if (!result.currentEvidence) return policy;

    const observedSource = {
      ...policy.verification.source,
      ...result.currentEvidence,
      url: policy.sourceUrl,
    };
    if (result.status === 'unchanged') {
      return {
        ...policy,
        verification: {
          ...policy.verification,
          source: observedSource,
          lastSourceAuditAt: result.checkedAt,
        },
      };
    }

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
