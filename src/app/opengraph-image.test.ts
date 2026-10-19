/** @vitest-environment node */
import sharp from 'sharp';
import { expect, it } from 'vitest';
import OpenGraphImage, { alt, contentType, size } from './opengraph-image';
import twitterImage, {
  alt as twitterAlt,
  contentType as twitterContentType,
  size as twitterSize,
} from './twitter-image';

it('renders a 1200 by 630 PNG of the site name and register line', async () => {
  expect(size).toEqual({ width: 1200, height: 630 });
  expect(contentType).toBe('image/png');
  expect(alt).toBe('Policai, Australian AI policy register');
  expect(twitterSize).toEqual(size);
  expect(twitterContentType).toBe(contentType);
  expect(twitterAlt).toBe(alt);

  const response = OpenGraphImage();
  expect(response.headers.get('content-type')).toContain('image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const meta = await sharp(bytes).metadata();
  expect(meta.width).toBe(1200);
  expect(meta.height).toBe(630);

  const twitter = twitterImage();
  const twitterBytes = Buffer.from(await twitter.arrayBuffer());
  expect(twitterBytes.equals(bytes)).toBe(true);
});
