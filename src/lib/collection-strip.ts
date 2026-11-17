import type { CollectionMeta } from '@/types';
import { auDate, sydneyShortDate } from '@/lib/au-date';

export const COLLECTION_STALE_MS = 36 * 60 * 60 * 1000;

export function collectionStripProps(meta: CollectionMeta, now: Date = new Date()) {
  return {
    collectedAt: meta.lastCollectedAt,
    collectionHealth: meta.collector.health,
    successfulSourceCount: meta.collector.successfulSourceCount,
    dueSourceCount: meta.collector.dueSourceCount,
    renderedAt: now.toISOString(),
  };
}

export type CollectionStrip = ReturnType<typeof collectionStripProps>;

export function isCollectionStale(collectedAt: string | null, now: number): boolean {
  if (!collectedAt) return false;
  return now - new Date(collectedAt).getTime() > COLLECTION_STALE_MS;
}

export function collectionStatusLabel(
  { collectedAt, collectionHealth, successfulSourceCount, dueSourceCount }: Omit<CollectionStrip, 'renderedAt'>,
  stale: boolean,
): string {
  if (stale && collectedAt) return `Last collected ${sydneyShortDate(collectedAt)}`;
  if (collectionHealth === 'healthy') return 'Sources reached';
  const unreachable = dueSourceCount - successfulSourceCount;
  if (unreachable <= 0) return 'Collection incomplete';
  return `${unreachable} of ${dueSourceCount} ${dueSourceCount === 1 ? 'source' : 'sources'} unreachable`;
}

export function formatCollectedAt(value: string | null): string {
  if (!value) return 'SOURCE STATUS IN METHODOLOGY';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'SOURCE STATUS IN METHODOLOGY';

  return `COLLECTED ${auDate(date, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
    timeZoneName: 'short',
  }).toUpperCase()}`;
}
