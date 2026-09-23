import type { Development } from '@/types';
import type { WatchSource } from '@/lib/pipeline/sources';

/**
 * Reader-facing streams for the developments feed. A stream is derived when
 * the feed is read, from the detecting source's category and the title, so
 * it needs no stored field and no classifier. Consultations come first
 * because they are the items a reader can still act on.
 */
export const DEVELOPMENT_STREAMS = [
  'consultation',
  'court',
  'regulator',
  'government',
] as const;

export type DevelopmentStream = (typeof DEVELOPMENT_STREAMS)[number];

const STREAM_NAMES: Record<DevelopmentStream, string> = {
  consultation: 'Consultations and inquiries',
  court: 'Courts and tribunals',
  regulator: 'Regulators',
  government: 'Government policy',
};

const CONSULTATION_PATTERN =
  /\b(consult\w*|submissions?|inquir(?:y|ies)|exposure draft|call for (?:views|input|comment))\b/i;

export function getDevelopmentStream(
  development: Pick<Development, 'sourceId' | 'title'>,
  sources: readonly Pick<WatchSource, 'id' | 'category'>[],
): DevelopmentStream {
  if (CONSULTATION_PATTERN.test(development.title)) return 'consultation';
  const category = sources.find(
    (source) => source.id === development.sourceId,
  )?.category;
  if (category === 'court') return 'court';
  if (category === 'regulator') return 'regulator';
  return 'government';
}

export function getDevelopmentStreamName(stream: DevelopmentStream): string {
  return STREAM_NAMES[stream];
}
