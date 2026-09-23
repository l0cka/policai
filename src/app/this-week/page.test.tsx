import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { getCollectionMeta, getDevelopments, getPolicies } from '@/lib/data-service';
import ThisWeekPage from './page';

vi.mock('@/lib/data-service', () => ({ getCollectionMeta: vi.fn(), getDevelopments: vi.fn(), getPolicies: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-22T02:00:00Z'));
  vi.mocked(getDevelopments).mockResolvedValue([]);
  vi.mocked(getCollectionMeta).mockResolvedValue({ lastCollectedAt: '2026-08-01T00:00:00Z', lastHealthyAt: null } as Awaited<ReturnType<typeof getCollectionMeta>>);
  vi.mocked(getPolicies).mockResolvedValue([
    buildPolicy({ id: 'past', title: 'Already passed', dates: [{ type: 'effective', date: '2026-09-01', precision: 'day' }] }),
    buildPolicy({ id: 'future', title: 'Still coming', dates: [{ type: 'effective', date: '2026-10-20', precision: 'day' }] }),
  ]);
});
afterEach(() => vi.useRealTimers());
it('does not present a past date as upcoming when collection has stalled', async () => {
  render(await ThisWeekPage());
  expect(screen.queryByText('Already passed')).not.toBeInTheDocument();
  expect(screen.getByText('Still coming')).toBeInTheDocument();
  expect(screen.getByText(/Collection is more than seven days old/)).toBeInTheDocument();
});
it('distinguishes missing collection evidence from a verified quiet week', async () => {
  vi.mocked(getCollectionMeta).mockResolvedValue({ lastCollectedAt: null, lastHealthyAt: null } as Awaited<ReturnType<typeof getCollectionMeta>>);
  render(await ThisWeekPage());
  expect(screen.getByText('Weekly coverage unavailable')).toBeInTheDocument();
  expect(screen.getByText('Still coming')).toBeInTheDocument();
  expect(screen.queryByText('No verified changes this week')).not.toBeInTheDocument();
});
