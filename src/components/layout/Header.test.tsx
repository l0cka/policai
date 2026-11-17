import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionMeta } from '@/types';
import {
  collectionStatusLabel,
  collectionStripProps,
  formatCollectedAt,
  isCollectionStale,
} from '@/lib/collection-strip';
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

const COLLECTED_AT = '2026-10-16T19:35:00.990Z';
const HOUR_MS = 60 * 60 * 1000;
const hoursAfterCollection = (hours: number) => new Date(Date.parse(COLLECTED_AT) + hours * HOUR_MS);

function healthyMeta(): CollectionMeta {
  return metaFixture({
    collector: {
      ...metaFixture().collector,
      health: 'healthy',
      successfulSourceCount: 59,
      failedSourceCount: 0,
      successRate: 1,
    },
  });
}

function renderStrip(meta: CollectionMeta, path = '/') {
  pathname = path;
  return render(<Header {...collectionStripProps(meta)} />).container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(hoursAfterCollection(2));
});
afterEach(() => vi.useRealTimers());

describe('collectionStatusLabel', () => {
  const strip = (health: CollectionMeta['collector']['health'], successful: number, due: number, collectedAt: string | null = COLLECTED_AT) => ({
    collectedAt,
    collectionHealth: health,
    successfulSourceCount: successful,
    dueSourceCount: due,
  });

  it.each([
    ['a healthy recent run', strip('healthy', 34, 34), 2, 'Sources reached'],
    ['one source down', strip('degraded', 33, 34), 2, '1 of 34 sources unreachable'],
    ['several sources down', strip('degraded', 57, 59), 2, '2 of 59 sources unreachable'],
    ['the only due source down', strip('failed', 0, 1), 2, '1 of 1 source unreachable'],
    ['a failed run', strip('failed', 0, 34), 2, '34 of 34 sources unreachable'],
    ['a degraded run with no source down', strip('degraded', 34, 34), 2, 'Collection incomplete'],
    ['a failed run with nothing due', strip('failed', 0, 0), 2, 'Collection incomplete'],
    ['a degraded run exactly 36 hours old', strip('degraded', 33, 34), 36, '1 of 34 sources unreachable'],
    ['a degraded run just past 36 hours', strip('degraded', 33, 34), 36.01, 'Last collected 17 Oct 2026'],
    ['a healthy run five days old', strip('healthy', 34, 34), 120, 'Last collected 17 Oct 2026'],
    ['no collection stamp', strip('degraded', 33, 34, null), 120, '1 of 34 sources unreachable'],
    ['an unparseable stamp', strip('healthy', 34, 34, 'not-a-date'), 120, 'Sources reached'],
  ])('reads %s', (_case, status, hours, label) => {
    const now = hoursAfterCollection(hours).getTime();
    expect(collectionStatusLabel(status, isCollectionStale(status.collectedAt, now))).toBe(label);
  });
});

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

  it('says how many sources a degraded run missed, never the raw health value', () => {
    const link = statusLink(renderStrip(metaFixture()));
    expect(link?.textContent).toBe('2 of 59 sources unreachable');
    expect(link?.getAttribute('aria-label')).toMatch(
      /^Source status: 2 of 59 sources unreachable\. 57\/59 due sources reached\. collected /,
    );
    expect(link?.outerHTML).not.toMatch(/degraded/i);
  });

  it('keeps a degraded label visible on phones', () => {
    const link = statusLink(renderStrip(metaFixture()));
    expect(link?.querySelector('.max-sm\\:sr-only')).toBeNull();
  });

  it('hides the healthy label on phones and keeps it for screen readers', () => {
    const link = statusLink(renderStrip(healthyMeta()));
    expect(link?.textContent).toContain('Sources reached');
    expect(link?.querySelector('.max-sm\\:sr-only')).not.toBeNull();
  });

  it('puts the collection date first once the run is more than 36 hours old', () => {
    vi.setSystemTime(hoursAfterCollection(120));
    const link = statusLink(renderStrip(metaFixture()));
    expect(link?.textContent).toBe('Last collected 17 Oct 2026');
    expect(link?.getAttribute('aria-label')).toMatch(
      /^Source status: last collected 17 oct 2026\. 57\/59 due sources reached\.$/,
    );
  });

  it('caps the phone label width, so the longest label wraps instead of widening the header', () => {
    const failed = metaFixture({
      collector: { ...metaFixture().collector, health: 'failed', dueSourceCount: 34, successfulSourceCount: 0 },
    });
    const label = statusLink(renderStrip(failed))?.querySelector('span:not([aria-hidden])');
    expect(label?.textContent).toBe('34 of 34 sources unreachable');
    expect(label?.className).toContain('max-sm:max-w-[7.5rem]');
    expect(Math.max(...(label?.textContent ?? '').split(' ').map((word) => word.length))).toBeLessThanOrEqual(11);
  });

  it('warns about an old healthy run, visibly on phones', () => {
    const fresh = statusLink(renderStrip(healthyMeta()))?.className;
    vi.setSystemTime(hoursAfterCollection(120));
    const link = statusLink(renderStrip(healthyMeta()));
    expect(link?.textContent).toBe('Last collected 17 Oct 2026');
    expect(link?.className).not.toBe(fresh);
    expect(link?.className).toBe(statusLink(renderStrip(metaFixture()))?.className);
    expect(link?.querySelector('.max-sm\\:sr-only')).toBeNull();
  });

  it('judges age by the reader\'s clock, not the time the page was built', () => {
    pathname = '/';
    const builtFresh = collectionStripProps(metaFixture(), hoursAfterCollection(2));
    vi.setSystemTime(hoursAfterCollection(120));
    expect(renderToString(<Header {...builtFresh} />)).toContain('2 of 59 sources unreachable');
    const link = statusLink(render(<Header {...builtFresh} />).container);
    expect(link?.textContent).toBe('Last collected 17 Oct 2026');
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
