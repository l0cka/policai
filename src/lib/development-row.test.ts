import { expect, it } from 'vitest';
import type { Development } from '@/types';
import { toDevelopmentRow } from '@/lib/development-row';

it('keeps list fields and drops the record evidence', () => {
  const row = toDevelopmentRow({
    id: 'dev-1',
    title: 'Title',
    url: 'https://example.gov.au/1',
    sourceId: 'src',
    sourceName: 'Source',
    jurisdiction: 'federal',
    detectedAt: '2026-09-20T00:00:00.000Z',
    relevanceScore: 0.6,
    classification: 'curated',
    assessment: { method: 'editorial', assessedAt: '2026-09-20T00:00:00.000Z' },
    verification: { status: 'verified', source: { url: 'https://example.gov.au/1' } },
    status: 'detected',
  } as Development);

  expect(row.verification).toEqual({ status: 'verified' });
  expect(row).not.toHaveProperty('assessment');
  expect(row).not.toHaveProperty('sourceId');
  expect(row.title).toBe('Title');
});
