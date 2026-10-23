import type { Development } from '@/types';

/** The fields the developments list reads; the rest of the record stays on the server. */
export type DevelopmentRow = Pick<
  Development,
  | 'id'
  | 'title'
  | 'url'
  | 'sourceName'
  | 'jurisdiction'
  | 'publishedAt'
  | 'publishedAtPrecision'
  | 'detectedAt'
  | 'summary'
  | 'relevanceScore'
  | 'classification'
  | 'relatedPolicyId'
> & { verification: Pick<Development['verification'], 'status'> };

export function toDevelopmentRow(development: Development): DevelopmentRow {
  return {
    id: development.id,
    title: development.title,
    url: development.url,
    sourceName: development.sourceName,
    jurisdiction: development.jurisdiction,
    publishedAt: development.publishedAt,
    publishedAtPrecision: development.publishedAtPrecision,
    detectedAt: development.detectedAt,
    summary: development.summary,
    relevanceScore: development.relevanceScore,
    classification: development.classification,
    relatedPolicyId: development.relatedPolicyId,
    verification: { status: development.verification.status },
  };
}
