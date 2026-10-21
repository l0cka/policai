import { expect, it } from 'vitest';
import robots from './robots';

it('points crawlers at the sitemap and keeps retired routes out of the crawl budget', () => {
  const doc = robots();
  expect(doc.sitemap).toBe('https://policai.org/sitemap.xml');
  expect(doc.host).toBe('https://policai.org');
  const rules = Array.isArray(doc.rules) ? doc.rules : [doc.rules];
  const disallow = rules.flatMap((rule) => {
    const value = rule?.disallow;
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  });
  expect(disallow).toEqual(
    expect.arrayContaining(['/admin/', '/api/', '/map', '/framework', '/blog']),
  );
});
