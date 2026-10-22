import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollectionMeta } from '@/types';
import { collectionStripProps, formatCollectedAt } from '@/lib/collection-strip';
import { Header } from './Header';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function metaFixture(overrides: Partial<CollectionMeta> = {}): CollectionMeta {
  return {
    lastCollectedAt: '2026-10-16T19:35:00.990Z',
    lastHealthyAt: '2026-10-06T19:33:28.224Z',
    lastUsableAt: '2026-10-06T19:33:28.224Z',
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

  it('falls back when the collection date is unparseable', () => {
    expect(formatCollectedAt('not-a-date')).toBe('SOURCE STATUS IN METHODOLOGY');
    expect(formatCollectedAt('not-a-date')).not.toMatch(/INVALID DATE/i);
  });
});

describe('source status link', () => {
  const statusLink = (container: HTMLElement) =>
    container.querySelector<HTMLAnchorElement>('[data-site-header] a[href="/status"]');

  it('names the last collection, not the last healthy run', () => {
    const link = statusLink(renderStrip(metaFixture()));
    expect(link?.getAttribute('aria-label')).toMatch(/collected 17 oct 2026,? 06:35/);
    expect(link?.getAttribute('aria-label')).not.toMatch(/07 oct|06 oct/);
  });

  it('shows degraded status and the source count separately', () => {
    const link = statusLink(renderStrip(metaFixture()));
    expect(link?.textContent).toContain('degraded');
    expect(link?.getAttribute('aria-label')).toContain('57/59 due sources reached');
  });

  it('keeps a degraded label visible on phones', () => {
    const link = statusLink(renderStrip(metaFixture()));
    const label = [...(link?.querySelectorAll('span') ?? [])].find((s) => /degraded/i.test(s.textContent ?? ''));
    expect(label?.className ?? '').not.toMatch(/sr-only/);
  });

  it('hides the healthy label on phones and keeps it for screen readers', () => {
    const link = statusLink(
      renderStrip(
        metaFixture({
          collector: {
            ...metaFixture().collector,
            health: 'healthy',
            successfulSourceCount: 59,
            failedSourceCount: 0,
            successRate: 1,
          },
        }),
      ),
    );
    expect(link?.textContent).toContain('Sources reached');
    expect(link?.querySelector('.max-sm\\:sr-only')).not.toBeNull();
  });

  it('uses the fallback text when nothing has been collected', () => {
    const link = statusLink(
      renderStrip(metaFixture({ lastCollectedAt: null, lastHealthyAt: '2026-10-06T19:33:28.224Z' })),
    );
    expect(link?.getAttribute('aria-label')).toContain('source status in methodology');
    expect(link?.getAttribute('aria-label')).not.toContain('collected');
  });

  it('stays in the header on article pages, so the header keeps one height', () => {
    expect(statusLink(renderStrip(metaFixture(), '/analysis/some-piece'))).not.toBeNull();
  });
});
