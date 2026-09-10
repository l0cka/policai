// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const dashboard = path.join(process.cwd(), 'apps/probono/dashboard');
const source = readFileSync(path.join(dashboard, 'next.config.ts'), 'utf8');

// Next 15 transpiles next.config.ts to CommonJS with a filename in the
// package directory. Exercise that contract without requiring child installs.
function loadConfig(directory: string) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, unknown> = {};
  runInNewContext(outputText, { exports, __dirname: directory, process });
  return exports.default;
}

describe('Pro Bono Next build root', () => {
  it.each([dashboard, '/app'])('anchors standalone and bundler roots to %s, not the invoking cwd', (directory) => {
    expect(loadConfig(directory)).toMatchObject({
      output: 'standalone',
      outputFileTracingRoot: directory,
      turbopack: { root: directory },
    });
  });

  it('retains the flat standalone server layout expected by Docker', () => {
    const dockerfile = readFileSync(path.join(dashboard, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('WORKDIR /app');
    expect(dockerfile).toContain('COPY --chown=node:node --from=build /app/.next/standalone ./');
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });
});
