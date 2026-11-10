// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withOriginalImageFallback } from './image-fallback.mjs';

const assetsFetch = vi.fn(async (url: URL) => new Response(`original ${url.pathname}`));
const env = { ASSETS: { fetch: assetsFetch } };
const image = (src: string) =>
  new Request(`https://policai.org/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`);
const failing = () => Promise.reject(new Error('IMAGES_TRANSFORM_ERROR'));

describe('withOriginalImageFallback', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

  it('passes optimized images through', async () => {
    const response = await withOriginalImageFallback(async () => new Response('optimized'), image('/a.png'), env);
    expect(await response.text()).toBe('optimized');
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('serves the stored original when optimization throws', async () => {
    const response = await withOriginalImageFallback(failing, image('/images/articles/a.png'), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('original /images/articles/a.png');
  });

  it('never falls back to the bundled data or other paths', async () => {
    for (const src of ['/_bundled/files.json', '/images/../_bundled/files.json', '/data/policies.json', '/images/..%2F_bundled/files.json']) {
      await expect(withOriginalImageFallback(failing, image(src), env)).rejects.toThrow('IMAGES_TRANSFORM_ERROR');
    }
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('never falls back to another origin', async () => {
    for (const src of ['https://evil.example/x.png', '//evil.example/x.png']) {
      await expect(withOriginalImageFallback(failing, image(src), env)).rejects.toThrow('IMAGES_TRANSFORM_ERROR');
    }
    expect(assetsFetch).not.toHaveBeenCalled();
  });
});
