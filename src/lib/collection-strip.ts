import type { CollectionMeta } from '@/types';
import { auDate } from '@/lib/au-date';

export function collectionStripProps(meta: CollectionMeta) {
  return {
    collectedAt: meta.lastCollectedAt,
    collectionHealth: meta.collector.health,
    successfulSourceCount: meta.collector.successfulSourceCount,
    dueSourceCount: meta.collector.dueSourceCount,
  };
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
