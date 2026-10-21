import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CollectionMeta, SourceRunResult } from '@/types';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import {
  publicAutomaticCollectionMeta,
  type CoverageCatalogSource,
} from './collection-coverage';

const AUTOMATIC: CoverageCatalogSource = {
  id: 'pm-media',
  enabled: true,
  automation: 'automatic',
  critical: true,
};
const ACCC: CoverageCatalogSource = {
  id: 'accc-rss',
  enabled: true,
  automation: 'manual',
};
const WA: CoverageCatalogSource = {
  id: 'wa-ai-policy',
  enabled: true,
  automation: 'manual',
};
const CATALOG = [AUTOMATIC, ACCC, WA];

function row(
  sourceId: string,
  status: SourceRunResult['status'],
  coverageEligible = true,
): SourceRunResult {
  return {
    sourceId,
    status,
    coverageEligible,
    checkedAt: '2026-10-17T19:33:37.076Z',
    durationMs: 1,
    itemCount: status === 'success' ? 1 : null,
    candidateCount: 0,
    newCandidateCount: 0,
    ...(status === 'error'
      ? { error: `${sourceId}: blocked`, failureClass: 'identity_refused' as const, failedUrl: 'https://www.example.gov.au/blocked' }
      : {}),
  };
}

function meta(results: SourceRunResult[], errors: string[]): CollectionMeta {
  return {
    lastCollectedAt: '2026-10-17T19:33:37.076Z',
    lastHealthyAt: '2026-10-06T19:33:28.224Z',
    lastReviewedAt: '2026-10-16T08:58:16.496Z',
    collector: {
      runCount: 80,
      lastRunSources: results
        .filter((result) => result.status !== 'skipped')
        .map((result) => result.sourceId),
      lastRunErrors: errors,
      health: 'degraded',
      dueSourceCount: 59,
      successfulSourceCount: 57,
      failedSourceCount: 2,
      skippedSourceCount: 0,
      successRate: 0.966,
      automaticSourceCount: 75,
      manualSourceCount: 3,
      sourceResults: results,
    },
  };
}

describe('publicAutomaticCollectionMeta', () => {
  it('drops manual source failures from the automatic count and clears a degraded run', () => {
    const recorded = meta(
      [row('pm-media', 'success'), row('accc-rss', 'error'), row('wa-ai-policy', 'error')],
      [
        'accc-rss: HTTP 403',
        'wa-ai-policy: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.finance.gov.au/file.pdf',
      ],
    );

    const projected = publicAutomaticCollectionMeta(recorded, CATALOG);

    expect(projected.collector).toMatchObject({
      health: 'healthy',
      dueSourceCount: 1,
      successfulSourceCount: 1,
      failedSourceCount: 0,
      successRate: 1,
      automaticSourceCount: 1,
      manualSourceCount: 2,
      lastRunSources: ['pm-media'],
      lastRunErrors: [],
    });
    expect(projected.collector.sourceResults.map((result) => result.sourceId)).toEqual([
      'pm-media',
    ]);
    expect(projected.lastHealthyAt).toBe(recorded.lastCollectedAt);
    expect(projected.lastReviewedAt).toBe(recorded.lastReviewedAt);
  });

  it('keeps an automatic failure degraded and does not move lastHealthyAt', () => {
    const recorded = meta(
      [row('pm-media', 'error'), row('wa-ai-policy', 'error', false)],
      ['pm-media: HTTP 503', 'wa-ai-policy: still blocked'],
    );

    const projected = publicAutomaticCollectionMeta(recorded, CATALOG);

    expect(projected.collector.health).toBe('failed');
    expect(projected.collector).toMatchObject({
      dueSourceCount: 1,
      failedSourceCount: 1,
      lastRunErrors: ['pm-media: HTTP 503'],
    });
    expect(projected.lastHealthyAt).toBe(recorded.lastHealthyAt);
  });

  it('still degrades on an automatic retry that is outside the due-source ratio', () => {
    const recorded = meta(
      [
        row('pm-media', 'success'),
        row('other-auto', 'error', false),
        row('wa-ai-policy', 'error'),
      ],
      ['other-auto: HTTP 503', 'wa-ai-policy: blocked'],
    );
    const catalog: CoverageCatalogSource[] = [
      AUTOMATIC,
      { id: 'other-auto', enabled: true, automation: 'automatic' },
      WA,
    ];

    const projected = publicAutomaticCollectionMeta(recorded, catalog);

    expect(projected.collector.health).toBe('degraded');
    expect(projected.collector).toMatchObject({
      dueSourceCount: 1,
      successfulSourceCount: 1,
      failedSourceCount: 0,
      lastRunErrors: ['other-auto: HTTP 503'],
    });
    expect(projected.lastHealthyAt).toBe(recorded.lastHealthyAt);
  });

  it('leaves a run with no manual rows untouched', () => {
    const recorded = meta([row('pm-media', 'success')], []);
    recorded.collector.health = 'healthy';
    expect(publicAutomaticCollectionMeta(recorded, CATALOG)).toBe(recorded);
  });

  it('commits public meta with no coverage-eligible manual failure', () => {
    const committed = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'meta.json'), 'utf8'),
    ) as CollectionMeta;
    const projected = publicAutomaticCollectionMeta(committed, WATCH_SOURCES);

    expect(projected).toEqual(committed);
    expect(committed.collector.health).toBe('healthy');
    expect(committed.collector.failedSourceCount).toBe(0);
    expect(committed.collector.lastRunErrors).toEqual([]);
    expect(committed.lastHealthyAt).toBe(committed.lastCollectedAt);
    for (const sourceId of ['accc-rss', 'wa-ai-policy']) {
      expect(committed.collector.lastRunSources).not.toContain(sourceId);
      expect(
        committed.collector.sourceResults.some(
          (result) =>
            result.sourceId === sourceId && result.coverageEligible !== false,
        ),
      ).toBe(false);
    }
  });
});
