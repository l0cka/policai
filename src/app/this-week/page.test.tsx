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
  expect(screen.getByRole('link', { name: 'Atom feed' })).toHaveAttribute('href', '/feed.xml');
});
it('reads each section heading with its count as separate words', async () => {
  render(await ThisWeekPage());
  expect(screen.getByRole('heading', { level: 2, name: 'Verified developments 0' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Coming up 1' })).toBeInTheDocument();
});
it('lists the legislative stages dated in the collected week, by stage date', async () => {
  vi.mocked(getCollectionMeta).mockResolvedValue({ lastCollectedAt: '2026-09-21T19:30:00Z', lastHealthyAt: null, lastUsableAt: '2026-09-21T19:30:00Z' } as Awaited<ReturnType<typeof getCollectionMeta>>);
  const page = 'https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7249';
  vi.mocked(getPolicies).mockResolvedValue([
    buildPolicy({
      id: 'tracked-bill',
      title: 'Tracked Bill 2026',
      type: 'legislation',
      status: 'proposed',
      legislative: {
        kind: 'bill',
        ref: { register: 'aph', billId: 'r7249' },
        origin: 'government',
        events: [
          { date: '2026-07-01', precision: 'day', event: { kind: 'introduced', chamber: 'lower' }, source: { url: page } },
          { date: '2026-09-17', precision: 'day', event: { kind: 'passed', chamber: 'lower' }, source: { url: page } },
        ],
      },
    }),
  ]);
  render(await ThisWeekPage());
  const section = screen.getByRole('heading', { level: 2, name: 'In Parliament and on the register 1' }).closest('section')!;
  expect(section).toHaveTextContent('Passed the House of Representatives');
  expect(section).not.toHaveTextContent('Introduced in the House of Representatives');
  expect(section.querySelector(`a[href="${page}"]`)).not.toBeNull();
  expect(screen.getByRole('navigation', { name: 'On this page' }).querySelector('a[href="#legislation"]')).toHaveTextContent(/1 legislative stage/);
});
