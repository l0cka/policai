/* @vitest-environment node */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';

const repoRoot = process.cwd();
let workDir: string | undefined;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
});

function runValidateData(policies: unknown[], bodies?: unknown) {
  const env = { ...process.env };
  delete env.GITHUB_BASE_SHA;
  workDir = mkdtempSync(path.join(os.tmpdir(), 'policai-validate-data-'));
  mkdirSync(path.join(workDir, 'data'));
  writeFileSync(
    path.join(workDir, 'data', 'policies.json'),
    JSON.stringify(policies),
  );
  if (bodies !== undefined)
    writeFileSync(path.join(workDir, 'data', 'bodies.json'), JSON.stringify(bodies));
  return spawnSync(
    path.join(repoRoot, 'node_modules', '.bin', 'tsx'),
    [
      '--tsconfig',
      path.join(repoRoot, 'tsconfig.json'),
      path.join(repoRoot, 'scripts', 'validate-data.ts'),
    ],
    { cwd: workDir, encoding: 'utf8', env },
  );
}

describe('scripts/validate-data.ts', () => {
  it('wires validatePolicyThemes so a bad record theme fails the script', () => {
    const result = runValidateData([
      { ...buildPolicy({ id: 'fixture-policy' }), themes: ['courts'] },
    ]);

    expect(result.stderr).toContain('ERROR fixture-policy: unknown theme "courts"');
    expect(result.status).toBe(1);
  }, 60_000);

  it('wires validateThemeCoverage so a short listed theme fails the script', () => {
    const result = runValidateData([
      {
        ...buildPolicy({ id: 'fixture-policy' }),
        themes: ['generative-ai'],
      },
    ]);

    expect(result.stderr).not.toContain('unknown theme');
    expect(result.stderr).toContain(
      'ERROR themes: "generative-ai" (Generative AI) is used by 1 register record; a listed theme needs at least 2',
    );
    expect(result.status).toBe(1);
  }, 60_000);

  it('wires validateBodies so a catalogue without a tier A body fails the script', () => {
    const result = runValidateData([buildPolicy({ id: 'fixture-policy' })], []);

    expect(result.stderr).toContain('ERROR bodies: no tier A body for federal');
    expect(result.status).toBe(1);
  }, 60_000);
});
