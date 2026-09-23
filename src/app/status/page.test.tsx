import { render, screen } from '@testing-library/react';
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
