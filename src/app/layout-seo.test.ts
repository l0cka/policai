import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root layout social metadata', () => {
  it('wires only shared OG/Twitter defaults from SITE_SOCIAL_DEFAULTS', () => {
    const source = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8');
    // Page-specific title/url/description must not be inlined on the layout
    // openGraph/twitter objects — Next inherits those onto every child route.
    expect(source).toMatch(/openGraph:\s*SITE_SOCIAL_DEFAULTS\.openGraph/);
    expect(source).toMatch(/twitter:\s*SITE_SOCIAL_DEFAULTS\.twitter/);
    expect(source).not.toMatch(/openGraph:\s*\{/);
    expect(source).not.toMatch(/twitter:\s*\{/);
  });
});
