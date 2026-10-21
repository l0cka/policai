import { describe, expect, it } from 'vitest';
import type { SourceRunResult } from '@/types';
import { advanceSourceHealth, sourcesNotReachedSince } from './source-health';

const row = (overrides: Partial<SourceRunResult>): SourceRunResult => ({
  sourceId: 'a',
  status: 'success',
  checkedAt: '2026-10-10T19:30:00.000Z',
  durationMs: 1,
  itemCount: 1,
  candidateCount: 0,
  newCandidateCount: 0,
  ...overrides,
});

describe('advanceSourceHealth', () => {
  it('counts consecutive failures from the first and clears them on success', () => {
    const failed = advanceSourceHealth({}, [
      row({ status: 'error', failureClass: 'timeout' }),
    ]);
    const again = advanceSourceHealth(failed, [
      row({ status: 'error', failureClass: 'identity_refused', checkedAt: '2026-10-11T19:30:00.000Z' }),
    ]);
    expect(again.a).toEqual({
      lastSuccessAt: null,
      firstFailureAt: '2026-10-10T19:30:00.000Z',
      consecutiveFailures: 2,
      lastFailureClass: 'identity_refused',
    });
    expect(
      advanceSourceHealth(again, [row({ checkedAt: '2026-10-12T19:30:00.000Z' })]).a,
    ).toEqual({
      lastSuccessAt: '2026-10-12T19:30:00.000Z',
      firstFailureAt: null,
      consecutiveFailures: 0,
      lastFailureClass: null,
    });
  });

  it('leaves skipped sources and candidate-only retries untouched', () => {
    const ledger = advanceSourceHealth({}, [row({})]);
    expect(
      advanceSourceHealth(ledger, [
        row({ status: 'skipped', checkedAt: '2026-10-11T19:30:00.000Z' }),
      ]),
    ).toEqual(ledger);
    expect(
      advanceSourceHealth(ledger, [
        row({ status: 'error', coverageEligible: false, checkedAt: '2026-10-11T19:30:00.000Z' }),
      ]),
    ).toEqual(ledger);
  });
});

describe('sourcesNotReachedSince', () => {
  const ledger = advanceSourceHealth(
    advanceSourceHealth({}, [
      row({ sourceId: 'old', status: 'error' }),
      row({ sourceId: 'ok' }),
      row({ sourceId: 'recovered-later' }),
    ]),
    [
      row({ sourceId: 'old', status: 'error', checkedAt: '2026-10-11T19:30:00.000Z' }),
      row({ sourceId: 'new', status: 'error', checkedAt: '2026-10-11T19:30:00.000Z' }),
      row({ sourceId: 'recovered-later', status: 'error', checkedAt: '2026-10-11T19:30:00.000Z' }),
    ],
  );

  it('names failing automatic sources with no success at or after the anchor, longest first', () => {
    expect(
      sourcesNotReachedSince('2026-10-10T19:30:00.000Z', ledger, ['new', 'old', 'ok', 'recovered-later']).map(
        (source) => source.sourceId,
      ),
    ).toEqual(['old', 'new']);
  });

  it('ignores sources outside the automatic inventory', () => {
    expect(sourcesNotReachedSince('2026-10-10T19:30:00.000Z', ledger, ['ok'])).toEqual([]);
  });
});
