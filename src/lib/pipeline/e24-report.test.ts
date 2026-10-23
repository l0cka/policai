/* @vitest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManualDecision } from '@/test/factories';
import type { CollectionMeta } from '@/types';
import { buildE24Report, E24_SOURCE_IDS, formatE24Report } from './e24-report';
import { WATCH_SOURCES } from './sources';

const FIXTURES = join(process.cwd(), 'src', 'test', 'fixtures', 'e24');
const meta = JSON.parse(readFileSync(join(FIXTURES, 'meta.json'), 'utf8')) as CollectionMeta;
const log = readFileSync(join(FIXTURES, 'collect.log'), 'utf8');
// The fixture run predates the moves to manual tracking.
const AUTOMATIC_CATALOG = WATCH_SOURCES.map((source) => ({ ...source, automation: 'automatic' as const }));

describe('buildE24Report', () => {
  it('names catalogued sources only', () => {
    const catalogued = new Set(WATCH_SOURCES.map((source) => source.id));
    expect(E24_SOURCE_IDS.filter((id) => !catalogued.has(id))).toEqual([]);
    expect(new Set(E24_SOURCE_IDS).size).toBe(16);
  });

  it('classifies each E24 source from meta.json and the run log', () => {
    const report = buildE24Report(meta, log, AUTOMATIC_CATALOG);
    const byId = new Map(report.e24.map((row) => [row.sourceId, row]));
    expect(report.e24.map((row) => row.sourceId)).toEqual([...E24_SOURCE_IDS]);
    expect(byId.get('industry-ai-publications')).toEqual({
      sourceId: 'industry-ai-publications',
      critical: true,
      outcome: 'refused',
      refusal: 'http2-reset',
      identityException: 'expired',
      error:
        'industry-ai-publications: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.industry.gov.au/publications?pub-topic=2963',
      logLines: [
        'FAILED industry-ai-publications: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.industry.gov.au/publications?pub-topic=2963',
      ],
    });
    expect(byId.get('dta-media')).toMatchObject({
      critical: true,
      outcome: 'refused',
      refusal: 'http-403',
      error: 'dta-media: HTTP 403',
    });
    expect(byId.get('digital-gov-ai')).toMatchObject({
      critical: true,
      outcome: 'success',
      refusal: null,
      error: null,
      logLines: [],
    });
    expect(byId.get('disr-news')).toMatchObject({
      critical: false,
      outcome: 'refused',
      refusal: 'http2-reset',
      error: 'disr-news: 1 candidate retrieval failure',
      logLines: [
        'disr-news: pending https://www.industry.gov.au/news/ai-example (page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.industry.gov.au/news/ai-example)',
      ],
    });
    expect(byId.get('naic-news')).toMatchObject({
      outcome: 'failed',
      refusal: null,
      error: 'naic-news: Timed out after 60000ms',
    });
    expect(byId.get('finance-news')).toMatchObject({
      outcome: 'not-due',
      identityException: null,
    });
    expect(byId.get('esafety-media')).toMatchObject({ outcome: 'not-run' });
  });

  it('lists refusals of other sources but not their ordinary failures', () => {
    const report = buildE24Report(meta, log, AUTOMATIC_CATALOG);
    expect(
      report.otherRefusals.map((row) => [row.sourceId, row.refusal]),
    ).toEqual([
      ['wa-ai-policy', 'http2-reset'],
      ['accc-rss', 'http-403'],
    ]);
  });

  it('reports a source moved to manual tracking as manual', () => {
    const catalog = AUTOMATIC_CATALOG.map((source) =>
      source.id === 'esafety-media'
        ? { ...source, automation: buildManualDecision(), critical: undefined }
        : source,
    );
    const row = buildE24Report(meta, '', catalog).e24.find(
      (entry) => entry.sourceId === 'esafety-media',
    );
    expect(row).toMatchObject({ outcome: 'manual', critical: false });
  });

  it('prints the run, the outcome counts and one line per source', () => {
    const text = formatE24Report(buildE24Report(meta, log, AUTOMATIC_CATALOG));
    const lines = text.split('\n');
    expect(lines[0]).toBe('run 2026-10-20T19:31:00.000Z health failed');
    expect(lines[1]).toBe(
      'E24 outcomes: refused 3, failed 1, success 1, not-due 1, not-run 10',
    );
    expect(lines).toContain(
      'dta-media\tcritical\trefused\thttp-403\texpired\tdta-media: HTTP 403',
    );
    expect(lines).toContain('other sources refused (2):');
  });
});
