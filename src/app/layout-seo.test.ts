import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root layout social metadata', () => {
  it('does not hard-code homepage title, description, or url into openGraph/twitter', () => {
    const source = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8');
    expect(source).toContain('SITE_SOCIAL_DEFAULTS');
    // Page-specific fields must live on routes (pageSocialMeta), not the layout
    // — Next inherits nested openGraph onto every child that omits its own.
    expect(source).not.toMatch(/openGraph:\s*\{[^}]*title:\s*SITE_TITLE/s);
    expect(source).not.toMatch(/openGraph:\s*\{[^}]*url:\s*SITE_URL/s);
    expect(source).not.toMatch(/openGraph:\s*\{[^}]*description:\s*SITE_DESCRIPTION/s);
    expect(source).not.toMatch(/twitter:\s*\{[^}]*title:\s*SITE_TITLE/s);
    expect(source).not.toMatch(/twitter:\s*\{[^}]*description:\s*SITE_DESCRIPTION/s);
  });
});
