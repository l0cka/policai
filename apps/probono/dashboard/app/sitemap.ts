import type { MetadataRoute } from 'next';

const BASE_URL = 'https://a2j.policai.org';

/*
 * The five live routes. Static entries only: every item on the feed and
 * deadlines pages carries its own off-site source link, and health, this-week
 * and api responses are per-request database reads with no per-record URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/this-week`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/deadlines`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/sector`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/health`,
      changeFrequency: 'daily',
      priority: 0.5,
    },
  ];
}