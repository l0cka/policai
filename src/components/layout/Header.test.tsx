import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollectionMeta } from '@/types';
import { Header, collectionStripProps, formatCollectedAt } from './Header';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function metaFixture(overrides: Partial<CollectionMeta> = {}): CollectionMeta {
  return {
    lastCollectedAt: '2026-10-16T19:35:00.990Z',
    lastHealthyAt: '2026-10-06T19:33:28.224Z',
    lastReviewedAt: null,
    collector: {
      runCount: 79,
      lastRunSources: [],
      lastRunErrors: [],
      health: 'degraded',
      dueSourceCount: 59,
      successfulSourceCount: 57,
      failedSourceCount: 2,
      skippedSourceCount: 17,
      successRate: 0.966,
      automaticSourceCount: 76,
      manualSourceCount: 2,
      sourceResults: [],
    },
    ...overrides,
  };
}

function renderStrip(meta: CollectionMeta, path = '/') {
  pathname = path;
  return render(<Header {...collectionStripProps(meta)} />).container;
}

describe('formatCollectedAt', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('renders Sydney time whatever the process time zone', () => {
    const value = '2026-10-15T20:30:00.000Z';
    const rendered = ['America/New_York', 'Asia/Tokyo', 'UTC'].map((tz) => {
      process.env.TZ = tz;
      return formatCollectedAt(value);
    });
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toMatch(/^COLLECTED 16 OCT 2026,? 07:30 /);
  });

  it('puts a UTC evening on the next Sydney calendar day', () => {
    expect(formatCollectedAt('2026-10-16T19:35:00.990Z')).toMatch(
      /^COLLECTED 17 OCT 2026,? 06:35 /,
    );
    expect(formatCollectedAt('2026-10-16T12:59:00.000Z')).toMatch(
      /^COLLECTED 16 OCT 2026,? 23:59 /,
    );
    expect(formatCollectedAt('2026-10-16T13:00:00.000Z')).toMatch(
      /^COLLECTED 17 OCT 2026,? 00:00 /,
    );
  });

  it('falls back when there is no collection date', () => {
    expect(formatCollectedAt(null)).toBe('SOURCE STATUS IN METHODOLOGY');
  });
});

describe('collection strip', () => {
  it('shows the last collection, not the last healthy run', () => {
    const strip = renderStrip(metaFixture());
    expect(strip.textContent).toMatch(/COLLECTED 17 OCT 2026,? 06:35/);
    expect(strip.textContent).not.toMatch(/07 OCT|06 OCT/);
  });

  it('shows degraded status and the source count separately', () => {
    const strip = renderStrip(metaFixture());
    expect(strip.textContent).toContain('degraded');
    expect(strip.textContent).toContain('57/59 due sources reached');
  });

  it('uses the fallback text when nothing has been collected', () => {
    const strip = renderStrip(
      metaFixture({ lastCollectedAt: null, lastHealthyAt: '2026-10-06T19:33:28.224Z' }),
    );
    expect(strip.textContent).toContain('SOURCE STATUS IN METHODOLOGY');
    expect(strip.textContent).not.toContain('COLLECTED');
  });

  it('is hidden on article pages', () => {
    const strip = renderStrip(metaFixture(), '/analysis/some-piece');
    expect(strip.textContent).not.toContain('COLLECTED');
  });
});
