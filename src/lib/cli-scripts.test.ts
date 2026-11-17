/* @vitest-environment node */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

interface ScriptCase {
  name: string;
  script: string;
  usage: string;
  offline: string[];
  accepted: string[];
  acceptedStatus: number;
  acceptedOutput: string;
}

const CASES: ScriptCase[] = [
  {
    name: 'audit-sources',
    script: 'audit-sources.ts',
    usage: 'Usage: npm run audit:sources --',
    offline: ['--source=no-such-source'],
    accepted: ['--include-manual', '--json'],
    acceptedStatus: 1,
    acceptedOutput: 'Unknown source id: no-such-source',
  },
  {
    name: 'audit-register',
    script: 'audit-register.ts',
    usage: 'Usage: npm run audit:register --',
    offline: ['--source=no-such-policy'],
    accepted: ['--write-evidence', '--strict', '--json'],
    acceptedStatus: 1,
    acceptedOutput: 'Unknown policy id: no-such-policy',
  },
  {
    name: 'check-freshness',
    script: 'check-freshness.ts',
    usage: 'Usage: npm run check:freshness --',
    offline: [],
    accepted: ['--now=2026-11-20', '--json'],
    acceptedStatus: 2,
    acceptedOutput: 'freshness-budget.json must contain non-negative integers',
  },
  {
    name: 'discover-sources',
    script: 'discover-sources.ts',
    usage: 'Usage: npm run discover:sources --',
    offline: ['--body=no-such-body'],
    accepted: ['--json'],
    acceptedStatus: 2,
    acceptedOutput: 'no-such-body',
  },
  {
    name: 'report-watch-coverage',
    script: 'report-watch-coverage.ts',
    usage: 'Usage: npm run report:watch-coverage --',
    offline: [],
    accepted: ['--json'],
    acceptedStatus: 0,
    acceptedOutput: '"cells": []',
  },
  {
    name: 'reconfirm-register propose',
    script: 'reconfirm-register.ts',
    usage: 'Usage: npm run reconfirm:register -- propose',
    offline: ['propose'],
    accepted: ['--kind=timeline', '--due-within=30', '--batch-size=10', '--exclude=a,b', '--dry-run'],
    acceptedStatus: 0,
    acceptedOutput: 'Dry run: nothing written.',
  },
  {
    name: 'reconfirm-register approve',
    script: 'reconfirm-register.ts',
    usage: 'Usage: npm run reconfirm:register -- approve',
    offline: ['approve', '--batch=no-such-batch'],
    accepted: [
      '--attestation=https://example.invalid/card',
      '--approved-at=2026-11-17T00:00:00.000Z',
      '--approved-by=Fixture Editor',
    ],
    acceptedStatus: 1,
    acceptedOutput: 'unknown batch no-such-batch',
  },
  {
    name: 'source-review-batch propose',
    script: 'source-review-batch.ts',
    usage: 'Usage: npm run source-review:batch -- propose',
    offline: ['propose', '--ids=no-such-review'],
    accepted: ['--batch-size=10'],
    acceptedStatus: 1,
    acceptedOutput: 'Staged source not found',
  },
  {
    name: 'source-review-batch approve',
    script: 'source-review-batch.ts',
    usage: 'Usage: npm run source-review:batch -- approve',
    offline: ['approve', '--batch=no-such-batch'],
    accepted: [],
    acceptedStatus: 1,
    acceptedOutput: 'Unknown batch no-such-batch',
  },
];

describe.each(CASES)('$name CLI flags', (scriptCase) => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'policai-cli-flags-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const run = (args: string[]) =>
    spawnSync(
      path.join(repoRoot, 'node_modules', '.bin', 'tsx'),
      [
        '--tsconfig',
        path.join(repoRoot, 'tsconfig.json'),
        path.join(repoRoot, 'scripts', scriptCase.script),
        ...scriptCase.offline,
        ...args,
      ],
      { cwd: workDir, encoding: 'utf8', timeout: 30_000 },
    );

  it('rejects a mistyped flag with exit 2 and the usage before it starts', () => {
    const result = run(['--no-such-flag']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option '--no-such-flag'");
    expect(result.stderr).toContain(scriptCase.usage);
    expect(result.stdout).toBe('');
    expect(readdirSync(workDir)).toEqual([]);
  }, 40_000);

  it('prints the usage and exits 0 for --help', () => {
    const result = run(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(scriptCase.usage);
    expect(result.stdout).toContain('--help');
    expect(result.stderr).toBe('');
    expect(readdirSync(workDir)).toEqual([]);
  }, 40_000);

  it('still accepts every documented flag', () => {
    const result = run(scriptCase.accepted);

    expect(result.stdout + result.stderr).toContain(scriptCase.acceptedOutput);
    expect(result.stderr).not.toContain('Usage:');
    expect(result.status).toBe(scriptCase.acceptedStatus);
  }, 40_000);
});

describe.each([
  ['reconfirm-register.ts', 'Usage: npm run reconfirm:register -- propose', 'Usage: npm run reconfirm:register -- approve'],
  ['source-review-batch.ts', 'Usage: npm run source-review:batch -- propose', 'Usage: npm run source-review:batch -- approve'],
])('%s subcommands', (script, proposeUsage, approveUsage) => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'policai-cli-flags-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const run = (args: string[]) =>
    spawnSync(
      path.join(repoRoot, 'node_modules', '.bin', 'tsx'),
      ['--tsconfig', path.join(repoRoot, 'tsconfig.json'), path.join(repoRoot, 'scripts', script), ...args],
      { cwd: workDir, encoding: 'utf8', timeout: 30_000 },
    );

  it.each([
    ['no subcommand', []],
    ['an unknown subcommand', ['no-such-command']],
  ])('rejects %s with exit 2 and both usages', (_name, args) => {
    const result = run(args);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Expected one of: propose, approve');
    expect(result.stderr).toContain(proposeUsage);
    expect(result.stderr).toContain(approveUsage);
    expect(result.stdout).toBe('');
    expect(readdirSync(workDir)).toEqual([]);
  }, 40_000);

  it('prints both usages for --help with no subcommand', () => {
    const result = run(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(proposeUsage);
    expect(result.stdout).toContain(approveUsage);
    expect(result.stderr).toBe('');
  }, 40_000);

  it('rejects approve without --batch', () => {
    const result = run(['approve']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--batch is required');
    expect(result.stderr).toContain(approveUsage);
    expect(readdirSync(workDir)).toEqual([]);
  }, 40_000);
});
