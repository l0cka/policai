import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import {
  getCollectionMeta,
  getPolicies,
  getSourceCheckTimes,
  getSourceMonitoring,
  getSourceReviews,
} from '@/lib/data-service';
import StatusPage from './page';

vi.mock('@/lib/data-service', () => ({
  getCollectionMeta: vi.fn(),
  getPolicies: vi.fn(),
  getSourceCheckTimes: vi.fn(),
  getSourceMonitoring: vi.fn(),
  getSourceReviews: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
  vi.mocked(getCollectionMeta).mockResolvedValue({
    lastCollectedAt: '2026-09-22T08:23:23.603Z',
    lastHealthyAt: '2026-09-22T08:23:23.603Z',
    lastReviewedAt: null,
    collector: {
      runCount: 71,
      lastRunSources: [],
      lastRunErrors: [],
      health: 'healthy',
      dueSourceCount: 41,
      successfulSourceCount: 41,
      failedSourceCount: 0,
      skippedSourceCount: 22,
      successRate: 1,
      automaticSourceCount: 63,
      manualSourceCount: 1,
      sourceResults: [],
    },
  });
  vi.mocked(getPolicies).mockResolvedValue([
    buildPolicy({ id: 'p', jurisdiction: 'act' }),
  ]);
  vi.mocked(getSourceCheckTimes).mockResolvedValue({
    'act-ai-policy': '2026-07-20T12:19:40.243Z',
  });
  vi.mocked(getSourceMonitoring).mockResolvedValue({ manualReviews: [] });
  vi.mocked(getSourceReviews).mockResolvedValue([
    { discoveredAt: '2026-09-01T00:00:00.000Z' } as Awaited<
      ReturnType<typeof getSourceReviews>
    >[number],
  ]);
});
afterEach(() => vi.useRealTimers());

it('flags a source whose last completed check is stale even when the run is healthy', async () => {
  render(await StatusPage());
  expect(
    screen.getByRole('heading', { level: 1, name: 'Source status' }),
  ).toBeInTheDocument();
  const row = screen.getByText('act-ai-policy').closest('tr');
  expect(row).toHaveTextContent('Overdue');
  expect(row).toHaveTextContent('64 days');
});

it('reports the editorial queue and the jurisdiction table', async () => {
  render(await StatusPage());
  expect(
    screen.getByText(/1 detection awaiting editorial review/),
  ).toBeInTheDocument();
  expect(screen.getByText(/oldest 22 days/)).toBeInTheDocument();
  expect(getSourceReviews).toHaveBeenCalledWith({ status: 'pending_review' });
  expect(
    screen.getByRole('columnheader', { name: 'Binding instruments' }),
  ).toBeInTheDocument();
});

it('states the limit of what coverage counts mean', async () => {
  render(await StatusPage());
  expect(
    screen.getByText(/not a measure of how much Australian AI policy exists/),
  ).toBeInTheDocument();
});

it('reports record re-verification age as information, not a failure', async () => {
  const old = buildPolicy({ id: 'old' });
  old.verification.checkedAt = '2026-06-01T00:00:00.000Z';
  vi.mocked(getPolicies).mockResolvedValue([old, buildPolicy({ id: 'recent' })]);
  render(await StatusPage());
  const section = screen.getByRole('heading', { name: 'Record review' }).closest('section');
  expect(section).toHaveTextContent(
    '1 of 2 public records is due for editorial re-verification',
  );
  expect(section).toHaveTextContent('oldest review 114 days ago');
  expect(section).toHaveTextContent('every 90 days');
  expect(section).toHaveTextContent('stays published and is labelled “Review due”');
});

it.each<[label: string, robotsUnverified: string[] | undefined]>([
  ['absent', undefined],
  ['empty', []],
])('shows no robots unverified section when the list is %s', async (_label, robotsUnverified) => {
  const meta = await getCollectionMeta();
  vi.mocked(getCollectionMeta).mockResolvedValue({
    ...meta,
    collector: { ...meta.collector, ...(robotsUnverified ? { robotsUnverified } : {}) },
  });
  render(await StatusPage());
  expect(screen.queryByRole('heading', { name: 'Robots unverified' })).not.toBeInTheDocument();
});

it('names the hosts whose robots.txt has not been readable for 3 or more runs', async () => {
  const meta = await getCollectionMeta();
  vi.mocked(getCollectionMeta).mockResolvedValue({
    ...meta,
    collector: { ...meta.collector, robotsUnverified: ['www.alpha.gov.au', 'www.beta.gov.au'] },
  });
  render(await StatusPage());
  const section = screen.getByRole('heading', { name: 'Robots unverified' }).closest('section');
  expect(section).toHaveTextContent('robots.txt for these hosts has not been readable for 3 or more runs');
  expect(section).toHaveTextContent('still paces requests');
  expect(
    within(section as HTMLElement)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['www.alpha.gov.au', 'www.beta.gov.au']);
});
