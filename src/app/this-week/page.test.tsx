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
it('anchors the week on the latest passing run, not the last fully healthy one', async () => {
  vi.mocked(getCollectionMeta).mockResolvedValue({ lastCollectedAt: '2026-09-21T19:30:00Z', lastHealthyAt: '2026-08-01T00:00:00Z', lastUsableAt: '2026-09-21T19:30:00Z' } as Awaited<ReturnType<typeof getCollectionMeta>>);
  render(await ThisWeekPage());
  expect(screen.queryByText(/Collection is more than seven days old/)).not.toBeInTheDocument();
});
it('distinguishes missing collection evidence from a verified quiet week', async () => {
  vi.mocked(getCollectionMeta).mockResolvedValue({ lastCollectedAt: null, lastHealthyAt: null } as Awaited<ReturnType<typeof getCollectionMeta>>);
  render(await ThisWeekPage());
  expect(screen.getByText('Weekly coverage unavailable')).toBeInTheDocument();
  expect(screen.getByText('Still coming')).toBeInTheDocument();
  expect(screen.queryByText('No verified changes this week')).not.toBeInTheDocument();
});
it('exposes habit jump links, counts and the developments Atom feed', async () => {
  render(await ThisWeekPage());
  const nav = screen.getByRole('navigation', { name: 'On this page' });
  expect(nav.querySelector('a[href="#verified"]')).toHaveTextContent(/0 verified/);
  expect(nav.querySelector('a[href="#coming-up"]')).toHaveTextContent(/1 coming up/);
  expect(nav.querySelector('a[href="/feed.xml"]')).toHaveTextContent('Atom feed');
  expect(nav.querySelector('a[href="/developments"]')).toHaveTextContent('Full developments');
});
it('reads each section heading with its count as separate words', async () => {
  render(await ThisWeekPage());
  expect(screen.getByRole('heading', { level: 2, name: 'Verified developments 0' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Coming up 1' })).toBeInTheDocument();
});
