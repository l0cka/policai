import { expect, it } from 'vitest';

it.each(['map', 'framework', 'blog'])(
  'titles the retired /%s 404 like every other not-found page',
  async (route) => {
    const page = await import(`./${route}/page`);
    expect(page.metadata.title).toBe('Page not found');
  },
);
