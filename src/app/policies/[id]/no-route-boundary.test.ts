import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('policy detail route', () => {
  it('has no loading.tsx, whose Suspense boundary React outlines into a hidden segment that only a script reveals', () => {
    expect(fs.existsSync(path.join(__dirname, 'loading.tsx'))).toBe(false);
  });
});
