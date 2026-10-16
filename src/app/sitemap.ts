import type { MetadataRoute } from 'next';
import { articleEditorialDate } from '@/lib/articles';
import { getArticles, getPolicies } from '@/lib/data-service';

const BASE_URL = 'https://policai.org';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [policies, articles] = await Promise.all([getPolicies(), getArticles()]);

  const policyEntries: MetadataRoute.Sitemap = policies.map((policy) => ({
    url: `${BASE_URL}/policies/${policy.id}`,
    lastModified: policy.updatedAt ? new Date(policy.updatedAt) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${BASE_URL}/analysis/${article.slug}`,
    lastModified: new Date(`${articleEditorialDate(article)}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/developments`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/analysis`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/courts`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/timeline`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/methodology`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/status`,
      changeFrequency: 'daily',
      priority: 0.5,
    },
  ];

  return [...staticPages, ...articleEntries, ...policyEntries];
}
