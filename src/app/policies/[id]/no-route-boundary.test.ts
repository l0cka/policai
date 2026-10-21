import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOADING_NAMES = ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js'] as const;
const APP_ROOT = path.resolve(__dirname, '../..');

function loadingBoundariesFrom(dir: string): string[] {
  const found: string[] = [];
  let current = path.resolve(dir);
  for (;;) {
    for (const name of LOADING_NAMES) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) {
        found.push(path.relative(APP_ROOT, candidate));
      }
    }
    if (current === APP_ROOT) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return found;
}

describe('policy detail route', () => {
  it('has no loading.{tsx,ts,jsx,js} in [id] or any parent segment up to src/app, whose Suspense boundary React outlines into a hidden segment that only a script reveals', () => {
    expect(loadingBoundariesFrom(__dirname)).toEqual([]);
  });
});
