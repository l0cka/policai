import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import {
  getCollectionMeta,
  getPolicies,
  getSourceMonitoring,
} from '@/lib/data-service';
import MethodologyPage from './page';

vi.mock('@/lib/data-service', () => ({
  getCollectionMeta: vi.fn(),
  getPolicies: vi.fn(),
  getSourceMonitoring: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
  vi.mocked(getCollectionMeta).mockResolvedValue({
    lastCollectedAt: '2026-09-22T08:23:23.603Z',
    lastHealthyAt: '2026-09-22T08:23:23.603Z',
    lastUsableAt: '2026-09-22T08:23:23.603Z',
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
  vi.mocked(getPolicies).mockResolvedValue([buildPolicy({ id: 'p' })]);
  vi.mocked(getSourceMonitoring).mockResolvedValue({ manualReviews: [] });
});

it('indexes machine feeds and API surfaces under a dedicated heading', async () => {
  render(await MethodologyPage());
  const section = screen
    .getByRole('heading', { name: 'Machine feeds and API' })
    .closest('section');
  expect(section).not.toBeNull();
  const scoped = within(section as HTMLElement);
  expect(scoped.getByRole('link', { name: '/feed.xml' })).toHaveAttribute(
    'href',
    '/feed.xml',
  );
  expect(
    scoped.getByRole('link', { name: '/analysis/feed.xml' }),
  ).toHaveAttribute('href', '/analysis/feed.xml');
  expect(scoped.getByRole('link', { name: '/api/policies' })).toHaveAttribute(
    'href',
    '/api/policies',
  );
  expect(
    scoped.getByRole('link', { name: '/api/developments' }),
  ).toHaveAttribute('href', '/api/developments');
  expect(scoped.getByRole('link', { name: '/api/status' })).toHaveAttribute(
    'href',
    '/api/status',
  );
  expect(section).toHaveTextContent('/api/policies/{id}/markdown');
});
