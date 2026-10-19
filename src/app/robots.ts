import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /api/ is machine JSON (already linked from methodology); keep crawlers
        // on HTML. Retired routes return 404 — discourage re-crawl noise.
        disallow: ['/admin/', '/api/', '/map', '/framework', '/blog'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
