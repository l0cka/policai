import { createHash } from 'node:crypto';
import type { Policy, SourceEvidence, TimelineEvent } from '@/types';

function stableJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableJsonValue(child)]),
    );
  }
  return value;
}

function revisionHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableJsonValue(value)))
    .digest('hex');
}

function editorialSourceEvidence(source: SourceEvidence): unknown {
  return {
    url: source.url,
    title: source.title,
    publisher: source.publisher,
    publishedAt: source.publishedAt,
    publishedAtPrecision: source.publishedAtPrecision,
    contentHash: source.contentHash,
    linkedDocuments: source.linkedDocuments?.map((document) => ({
      url: document.url,
      contentHash: document.contentHash,
    })),
		browserCapture: source.browserCapture,
    manualExtraction: source.manualExtraction,
    reviewedDate: source.reviewedDate,
  };
}

function editorialVerification<T extends Policy | TimelineEvent>(
  record: T,
): T['verification'] {
  const verification = { ...record.verification };
  delete verification.lastSourceAuditAt;
  return {
    ...verification,
    source: editorialSourceEvidence(record.verification.source),
  } as T['verification'];
}

export function policyRevisionHash(policy: Policy): string {
  return revisionHash({
    ...policy,
    dates: policy.dates.map((date) => ({
      ...date,
      source: date.source
        ? editorialSourceEvidence(date.source)
        : undefined,
    })),
    verification: editorialVerification(policy),
  });
}

export function timelineRevisionHash(event: TimelineEvent): string {
  return revisionHash({
    ...event,
    verification: editorialVerification(event),
  });
}
