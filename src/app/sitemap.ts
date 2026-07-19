import type { MetadataRoute } from 'next';
import { getPolicies } from '@/lib/data-service';

const BASE_URL = 'https://policai.com.au';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const policies = await getPolicies();

  const policyEntries: MetadataRoute.Sitemap = policies.map((policy) => ({
    url: `${BASE_URL}/policies/${policy.id}`,
    lastModified: policy.updatedAt ? new Date(policy.updatedAt) : undefined,
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
      url: `${BASE_URL}/courts`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/agencies`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/map`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/framework`,
      changeFrequency: 'monthly',
      priority: 0.6,
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
  ];

  return [...staticPages, ...policyEntries];
}
