import {
  retrieveSource,
  SourceFetchError,
  type RetrievedSource,
} from '@/lib/pipeline/fetch';
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
  current: SourceEvidence,
): EvidenceComparison {
  const linkedComparison = compareLinkedDocuments(
    previous.linkedDocuments,
    current.linkedDocuments,
  );
  const retrievalMethodsMatch =
    Boolean(previous.browserCapture) === Boolean(current.browserCapture);

  if (!retrievalMethodsMatch) {
    return (
      linkedComparison ?? {
        status: 'comparison_unavailable',
        error:
          'Stored browser-capture evidence is not directly comparable with the current server-retrieval fingerprint',
      }
    );
  }

  if (!previous.contentHash || !current.contentHash) {
    return {
      status: 'comparison_unavailable',
      error: 'Comparable source evidence is missing a content fingerprint',
    };
  }
  return {
    status:
      previous.contentHash === current.contentHash
        ? 'unchanged'
        : 'changed',
    basis: 'content_hash',
  };
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
        const comparison = previousHash
          ? compareRegisterSourceEvidence(
              policy.verification.source,
              retrieved.evidence,
            )
          : null;
        const status: RegisterAuditStatus = comparison
          ? comparison.status
          : 'baseline_missing';
        return {
          policyId: policy.id,
          title: policy.title,
          sourceUrl: policy.sourceUrl,
          status,
          checkedAt,
          previousHash,
          currentEvidence: retrieved.evidence,
          comparisonBasis: comparison?.basis,
          error: comparison?.error,
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

    if (result.status === 'comparison_unavailable') return policy;

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
          source:
            result.comparisonBasis === 'linked_documents'
              ? policy.verification.source
              : observedSource,
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
