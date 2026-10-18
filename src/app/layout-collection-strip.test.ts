import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = fs.readFileSync(
  path.resolve(__dirname, 'layout.tsx'),
  'utf8',
);

describe('root layout collection strip', () => {
  it('passes collection meta through collectionStripProps, not raw lastHealthyAt', () => {
    expect(layoutSource).toMatch(
      /import\s*\{\s*collectionStripProps\s*\}\s*from\s*'@\/lib\/collection-strip'/,
    );
    expect(layoutSource).toMatch(
      /<Header\s+\{\.\.\.collectionStripProps\(collectionMeta\)\}\s*\/>/,
    );
    expect(layoutSource).not.toMatch(/lastHealthyAt/);
    expect(layoutSource).not.toMatch(/dataCurrentAt/);
  });
});
