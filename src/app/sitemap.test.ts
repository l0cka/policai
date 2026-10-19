import { expect, it, vi } from 'vitest';
import sitemap from './sitemap';

vi.mock('@/lib/data-service', () => ({
  getPolicies: vi.fn(async () => []),
  getArticles: vi.fn(async () => []),
}));

it('lists /coverage and no longer lists /network (#330)', async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toContain('https://policai.org/coverage');
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
