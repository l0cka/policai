/* @vitest-environment node */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';

const repoRoot = process.cwd();

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { if?: string; 'runs-on': unknown; steps: Step[] };
type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
};

const source = readFileSync(path.join(repoRoot, '.github/workflows/signed-records.yml'), 'utf8');
const workflow = yaml.load(source) as Workflow;
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

describe('signed-records workflow', () => {
  it('is defined by main and holds a read-only token and no secrets', () => {
    expect(Object.keys(workflow.on)).toEqual(['pull_request_target']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(source).not.toMatch(/secrets\.|github\.token|GITHUB_TOKEN/);
    for (const job of Object.values(workflow.jobs)) expect(job).not.toHaveProperty('permissions');
  });

  it('reports on every pull request, so a skipped job never reads as a pass', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['signed-records']);
    expect(workflow.jobs['signed-records']).not.toHaveProperty('if');
    for (const step of steps) expect(step).not.toHaveProperty('if');
  });

  it('runs on a GitHub-hosted runner, never on the pool that runs pull request code', () => {
    expect(workflow.jobs['signed-records']['runs-on']).toBe('ubuntu-latest');
    expect(source).not.toMatch(/self-hosted|argus/i);
  });

  it('checks out only the base revision and keeps no credentials', () => {
    const checkouts = steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].with).toEqual({ 'fetch-depth': 0, 'persist-credentials': false });
  });

  it('pins every action to a full commit sha', () => {
    const uses = steps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });

  it('passes event fields to scripts through env, never by interpolation', () => {
    const scripts = steps.flatMap((step) => (step.run ? [step.run] : []));
    for (const script of scripts) expect(script).not.toContain('${{');
    expect(scripts.at(-1)).toBe('npx --no-install tsx scripts/check-signed-records.ts HEAD "$HEAD_SHA"');
    expect(steps.at(-1)!.env).toEqual({ HEAD_SHA: '${{ github.event.pull_request.head.sha }}' });
  });

  it('runs no script that the pull request controls', () => {
    const scripts = steps.flatMap((step) => (step.run ? [step.run] : []));
    expect(scripts.join('\n')).not.toMatch(/git (checkout|switch|merge|pull|worktree|reset)\b|npm run|npm test/);
  });
});

const passkey = {
  credentialId: 'fixture-credential',
  publicKey: 'fixture-public-key',
  reviewer: 'Fixture Editor',
  registeredAt: '2026-01-01T00:00:00.000Z',
};
const published = buildPolicy({ id: 'published-policy' });

let workDir: string | undefined;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
});

function repository() {
  workDir = mkdtempSync(path.join(os.tmpdir(), 'policai-signed-records-'));
  const cwd = workDir;
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args],
      { cwd, encoding: 'utf8' },
    ).trim();
  const commit = (files: Record<string, unknown>) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      writeFileSync(path.join(cwd, file), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    git('add', '--all');
    git('commit', '--quiet', '--message', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const check = (base: string, head: string) =>
    spawnSync(
      path.join(repoRoot, 'node_modules', '.bin', 'tsx'),
      ['--tsconfig', path.join(repoRoot, 'tsconfig.json'), path.join(repoRoot, 'scripts', 'check-signed-records.ts'), base, head],
      { cwd, encoding: 'utf8' },
    );
  git('init', '--quiet', '--initial-branch=main');
  return { git, commit, check };
}

describe('scripts/check-signed-records.ts', () => {
  it('fails an unsigned change to a published record even when the pull request rewrites the validator', () => {
    const { git, commit, check } = repository();
    const base = commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published] });
    git('switch', '--quiet', '--create', 'change');
    const head = commit({
      'data/policies.json': [{ ...published, title: 'Rewritten without a signature' }],
      'src/lib/signed-record-changes.ts': 'export const validateSignedRecordChanges = () => ({ errors: [], warnings: [] });\n',
      'scripts/check-signed-records.ts': 'process.exit(0);\n',
    });

    const result = check(base, head);

    expect(result.stderr).toContain(
      'ERROR policies:published-policy: a published record changed without a decision signed on this branch',
    );
    expect(result.status).toBe(1);
  }, 60_000);

  it('passes a pull request that is behind main and changes no published record', () => {
    const { git, commit, check } = repository();
    commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published], 'README.md': 'one\n' });
    git('switch', '--quiet', '--create', 'change');
    const head = commit({ 'README.md': 'two\n' });
    git('switch', '--quiet', 'main');
    const base = commit({ 'data/policies.json': [{ ...published, title: 'Changed on main since the branch was cut' }] });

    const result = check(base, head);

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('0 errors');
    expect(result.status).toBe(0);
  }, 60_000);

  it('fails an unsigned change from a branch cut before the passkey was registered', () => {
    const { git, commit, check } = repository();
    commit({ 'data/policies.json': [published], 'data/editor-passkeys.json': [] });
    git('switch', '--quiet', '--create', 'change');
    const head = commit({ 'data/policies.json': [{ ...published, title: 'Rewritten without a signature' }] });
    git('switch', '--quiet', 'main');
    const base = commit({ 'data/editor-passkeys.json': [passkey] });

    const result = check(base, head);

    expect(result.stderr).toContain('ERROR policies:published-policy: a published record changed without a decision signed');
    expect(result.status).toBe(1);
  }, 60_000);

  it('fails a pull request that changes the passkey registry', () => {
    const { git, commit, check } = repository();
    const base = commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published] });
    git('switch', '--quiet', '--create', 'change');
    const head = commit({ 'data/editor-passkeys.json': [passkey, { ...passkey, credentialId: 'agent-credential' }] });

    const result = check(base, head);

    expect(result.stderr).toContain('ERROR editor-passkeys: the registry changed after an editor passkey was registered');
    expect(result.status).toBe(1);
  }, 60_000);

  it('fails closed when the pull request does not merge cleanly or its data is not JSON', () => {
    const { git, commit, check } = repository();
    commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published] });
    git('switch', '--quiet', '--create', 'conflict');
    const conflicting = commit({ 'data/policies.json': [{ ...published, title: 'Branch title' }] });
    git('switch', '--quiet', 'main');
    git('switch', '--quiet', '--create', 'broken');
    const broken = commit({ 'data/policies.json': 'not json' });
    git('switch', '--quiet', 'main');
    const base = commit({ 'data/policies.json': [{ ...published, title: 'Main title' }] });

    const conflict = check(base, conflicting);
    expect(conflict.stderr).toContain('does not merge cleanly');
    expect(conflict.status).toBe(1);

    const invalid = check(git('rev-parse', 'main~1'), broken);
    expect(invalid.stderr).toContain('Invalid JSON in data/policies.json');
    expect(invalid.status).toBe(1);
  }, 60_000);

  it('fails a data path that the pull request turns into a symlink', () => {
    const { git, commit, check } = repository();
    const base = commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published] });
    git('switch', '--quiet', '--create', 'change');
    rmSync(path.join(workDir!, 'data/policies.json'));
    symlinkSync('[]', path.join(workDir!, 'data/policies.json'));
    const head = commit({ 'data/[]': [{ ...published, title: 'Rewritten without a signature' }] });
    expect(JSON.parse(readFileSync(path.join(workDir!, 'data/policies.json'), 'utf8'))[0].title).toBe(
      'Rewritten without a signature',
    );

    const result = check(base, head);

    expect(result.stderr).toContain('data/policies.json is not a regular file (120000 blob)');
    expect(result.status).toBe(1);
  }, 60_000);

  it('fails a pull request that deletes or renames a data file the base has', () => {
    const { git, commit, check } = repository();
    const base = commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published] });
    git('switch', '--quiet', '--create', 'rename');
    git('mv', 'data/policies.json', 'data/policies-v2.json');
    const renamed = commit({ 'data/policies-v2.json': [{ ...published, title: 'Rewritten without a signature' }] });
    git('switch', '--quiet', 'main');
    git('switch', '--quiet', '--create', 'directory');
    git('mv', 'data', 'records');
    symlinkSync('records', path.join(workDir!, 'data'));
    const relinked = commit({ 'records/policies.json': [{ ...published, title: 'Rewritten without a signature' }] });

    for (const head of [renamed, relinked]) {
      const result = check(base, head);
      expect(result.stderr).toContain('data/policies.json is missing from the pull request');
      expect(result.status).toBe(1);
    }
  }, 60_000);

  it('passes a pull request that adds a data file the base does not have yet', () => {
    const { git, commit, check } = repository();
    const base = commit({ 'data/editor-passkeys.json': [passkey], 'data/policies.json': [published] });
    git('switch', '--quiet', '--create', 'change');
    const head = commit({ 'data/timeline.json': [] });

    const result = check(base, head);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  }, 60_000);
});
