// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('independent Pro Bono subtree', () => {
  it('keeps child source files out of the root TypeScript program', () => {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
    expect(config.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    expect(parsed.errors).toEqual([]);
    expect(parsed.fileNames.some((file) => file.includes('/src/app/'))).toBe(true);
    expect(parsed.fileNames.filter((file) => file.includes('/apps/probono/'))).toEqual([]);
  });

  it('ignores child dashboard and worker source in root ESLint', async () => {
    const eslint = new ESLint({ cwd: root });
    for (const file of ['dashboard/app/page.tsx', 'worker/src/fetch-all.ts']) {
      expect(await eslint.isPathIgnored(path.join(root, 'apps/probono', file))).toBe(true);
    }
    expect(await eslint.isPathIgnored(path.join(root, 'src/app/page.tsx'))).toBe(false);
  });

  it('retains separate lockfiles without npm workspaces', () => {
    for (const directory of ['.', 'apps/probono/dashboard', 'apps/probono/worker']) {
      const manifest = JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
      expect(manifest.workspaces).toBeUndefined();
      expect(existsSync(path.join(root, directory, 'package-lock.json'))).toBe(true);
    }
    const vitest = readFileSync(path.join(root, 'vitest.config.ts'), 'utf8');
    expect(vitest).toContain("include: ['src/**/*.{test,spec}.{ts,tsx}']");
  });
});
