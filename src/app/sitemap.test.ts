import { expect, it, vi } from 'vitest';
import { getCollectionMeta } from '@/lib/data-service';
import sitemap from './sitemap';

vi.mock('@/lib/data-service', () => ({
  getPolicies: vi.fn(async () => []),
  getArticles: vi.fn(async () => []),
  getCollectionMeta: vi.fn(async () => ({
    lastCollectedAt: '2026-10-17T19:33:37.076Z',
  })),
}));

it('lists /coverage and no longer lists /network (#330)', async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toContain('https://policai.org/coverage');
  expect(urls).toContain('https://policai.org/legislation');
  expect(urls.filter((url) => url.includes('/network'))).toEqual([]);
});

it('lists habit surfaces this-week and developments ahead of lower-traffic explore pages', async () => {
  const entries = await sitemap();
  const urls = entries.map((entry) => entry.url);
  expect(urls).toContain('https://policai.org/this-week');
  expect(urls).toContain('https://policai.org/developments');
  expect(urls.indexOf('https://policai.org/this-week')).toBeLessThan(
    urls.indexOf('https://policai.org/timeline'),
  );
  const thisWeek = entries.find((entry) => entry.url.endsWith('/this-week'));
  expect(thisWeek?.priority).toBe(0.9);
  expect(thisWeek?.changeFrequency).toBe('daily');
});

it('stamps each hub with lastCollectedAt', async () => {
  const stamp = new Date('2026-10-17T19:33:37.076Z');
  const entries = await sitemap();
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry.lastModified).toEqual(stamp);
  }
});

it('omits hub lastModified when the collection time is missing', async () => {
  vi.mocked(getCollectionMeta).mockResolvedValueOnce({
    lastCollectedAt: null,
  } as Awaited<ReturnType<typeof getCollectionMeta>>);
  const entries = await sitemap();
  for (const entry of entries) {
    expect(entry).not.toHaveProperty('lastModified');
  }
});
