import type { MetadataRoute } from 'next';
import { articleEditorialDate } from '@/lib/articles';
import { getArticles, getCollectionMeta, getPolicies } from '@/lib/data-service';
import { SITE_URL } from '@/lib/site-seo';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [policies, articles, meta] = await Promise.all([
    getPolicies(),
    getArticles(),
    getCollectionMeta(),
  ]);
  const collectedAt = meta.lastCollectedAt
    ? new Date(meta.lastCollectedAt)
    : undefined;

  const policyEntries: MetadataRoute.Sitemap = policies.map((policy) => ({
    url: `${SITE_URL}/policies/${policy.id}`,
    lastModified: policy.updatedAt ? new Date(policy.updatedAt) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${SITE_URL}/analysis/${article.slug}`,
    lastModified: new Date(`${articleEditorialDate(article)}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Habit surfaces first: this-week and developments lead human nav after home
  // (Cloudflare visits, Sep–Oct 2026). Include them explicitly for crawl clarity.
  const staticPages: MetadataRoute.Sitemap = (
    [
      {
        url: SITE_URL,
        changeFrequency: 'daily',
        priority: 1.0,
      },
      {
        url: `${SITE_URL}/this-week`,
        changeFrequency: 'daily',
        priority: 0.9,
      },
      {
        url: `${SITE_URL}/developments`,
        changeFrequency: 'daily',
        priority: 0.9,
      },
      {
        url: `${SITE_URL}/analysis`,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/courts`,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/methodology`,
        changeFrequency: 'monthly',
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/timeline`,
        changeFrequency: 'weekly',
        priority: 0.6,
      },
      {
        url: `${SITE_URL}/coverage`,
        changeFrequency: 'weekly',
        priority: 0.6,
      },
      {
        url: `${SITE_URL}/status`,
        changeFrequency: 'daily',
        priority: 0.5,
      },
    ] as const
  ).map((page) =>
    collectedAt ? { ...page, lastModified: collectedAt } : page,
  );

  return [...staticPages, ...articleEntries, ...policyEntries];
}
