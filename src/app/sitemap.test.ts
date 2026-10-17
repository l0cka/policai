import { expect, it, vi } from 'vitest';
import sitemap from './sitemap';

vi.mock('@/lib/data-service', () => ({
  getPolicies: vi.fn(async () => []),
  getArticles: vi.fn(async () => []),
}));

it('lists /coverage and no longer lists /network', async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toContain('https://policai.org/coverage');
  expect(urls.filter((url) => url.includes('/network'))).toEqual([]);
});
