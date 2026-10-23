import type { CollectionMeta, SourceRunResult } from '@/types';
import { WATCH_SOURCES, type WatchSource } from './sources';

export const E24_SOURCE_IDS = [
  'industry-ai-publications',
  'industry-ministers-media',
  'dta-media',
  'digital-gov-ai',
  'disr-news',
  'naic-news',
  'finance-news',
  'agd-ministers-media',
  'apsc-latest-news',
  'anao-performance-audits',
  'acma-media',
  'tga-media',
  'teqsa-news',
  'esafety-media',
  'fcfcoa-practice-directions',
  'art-practice-directions',
] as const;

const REFUSAL_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['http2-reset', /ERR_HTTP2_PROTOCOL_ERROR/],
  ['connection-reset', /ERR_CONNECTION_RESET|ECONNRESET/],
  ['http-403', /\bHTTP 403\b/],
];

export const E24_OUTCOMES = [
  'refused',
  'failed',
  'success',
  'not-due',
  'manual',
  'not-run',
] as const;

export type E24Outcome = (typeof E24_OUTCOMES)[number];

export interface E24SourceRow {
  sourceId: string;
  critical: boolean;
  outcome: E24Outcome;
  refusal: string | null;
  identityException: SourceRunResult['identityException'] | null;
  error: string | null;
  logLines: string[];
}

export interface E24Report {
  lastCollectedAt: string | null;
  health: CollectionMeta['collector']['health'];
  e24: E24SourceRow[];
  otherRefusals: E24SourceRow[];
}

export function refusalKind(text: string): string | null {
  return REFUSAL_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0].trim();
}

export function collectLogLinesBySource(log: string): Map<string, string[]> {
  const bySource = new Map<string, string[]>();
  for (const raw of log.split('\n')) {
    const at = raw.indexOf('[collect] ');
    if (at === -1) continue;
    const line = raw.slice(at + '[collect] '.length).trim();
    const match = /^(?:FAILED )?([a-z0-9-]+): /.exec(line);
    if (!match) continue;
    const lines = bySource.get(match[1]) ?? [];
    lines.push(line);
    bySource.set(match[1], lines);
  }
  return bySource;
}

function rowFor(
  sourceId: string,
  source: WatchSource | undefined,
  result: SourceRunResult | undefined,
  logLines: string[],
): E24SourceRow {
  const failureLines = logLines.filter((line) => / failed | pending |^FAILED /.test(line));
  const error = result?.error ? firstLine(result.error) : null;
  const refusal =
    result?.status === 'error'
      ? refusalKind(error ?? '') ??
        failureLines.map(refusalKind).find((kind) => kind !== null) ??
        null
      : null;
  const outcome: E24Outcome = !result
    ? source && source.automation !== 'automatic'
      ? 'manual'
      : 'not-run'
    : result.status === 'skipped'
      ? 'not-due'
      : result.status === 'success'
        ? 'success'
        : refusal
          ? 'refused'
          : 'failed';
  return {
    sourceId,
    critical: source?.critical ?? false,
    outcome,
    refusal,
    identityException: result?.identityException ?? null,
    error,
    logLines: failureLines.map(firstLine),
  };
}

export function buildE24Report(
  meta: CollectionMeta,
  log = '',
  catalog: readonly WatchSource[] = WATCH_SOURCES,
): E24Report {
  const sources = new Map(catalog.map((source) => [source.id, source]));
  const results = new Map(
    meta.collector.sourceResults.map((result) => [result.sourceId, result]),
  );
  const logLines = collectLogLinesBySource(log);
  const row = (sourceId: string) =>
    rowFor(sourceId, sources.get(sourceId), results.get(sourceId), logLines.get(sourceId) ?? []);
  const e24Ids = new Set<string>(E24_SOURCE_IDS);
  return {
    lastCollectedAt: meta.lastCollectedAt,
    health: meta.collector.health,
    e24: E24_SOURCE_IDS.map(row),
    otherRefusals: meta.collector.sourceResults
      .filter((result) => !e24Ids.has(result.sourceId) && result.status === 'error')
      .map((result) => row(result.sourceId))
      .filter((entry) => entry.outcome === 'refused'),
  };
}

export function formatE24Report(report: E24Report): string {
  const line = (entry: E24SourceRow) =>
    [
      entry.sourceId,
      entry.critical ? 'critical' : '-',
      entry.outcome,
      entry.refusal ?? '-',
      entry.identityException ?? '-',
      entry.error ?? '-',
    ].join('\t');
  const details = (entry: E24SourceRow) =>
    entry.logLines.map((logLine) => `  log: ${logLine}`);
  const section = (entries: E24SourceRow[]) =>
    entries.flatMap((entry) => [line(entry), ...details(entry)]);
  const counts = E24_OUTCOMES.map((outcome) => [
    outcome,
    report.e24.filter((entry) => entry.outcome === outcome).length,
  ] as const).filter(([, count]) => count > 0);
  return [
    `run ${report.lastCollectedAt ?? 'never'} health ${report.health}`,
    `E24 outcomes: ${counts.map(([outcome, count]) => `${outcome} ${count}`).join(', ')}`,
    ['source', 'critical', 'outcome', 'refusal', 'identityException', 'error'].join('\t'),
    ...section(report.e24),
    `other sources refused (${report.otherRefusals.length}):`,
    ...section(report.otherRefusals),
  ].join('\n');
}
