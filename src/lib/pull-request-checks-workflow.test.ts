/* @vitest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

type Step = { name?: string; run?: string; env?: Record<string, string> };
type Job = { name: string; env?: Record<string, string>; steps: Step[] };
type Workflow = { permissions: Record<string, string>; jobs: Record<string, Job> };

const source = readFileSync(path.join(repoRoot, '.github/workflows/pull-request-checks.yml'), 'utf8');
const workflow = yaml.load(source) as Workflow;

function scripts(packageDir: string): Record<string, string> {
  return JSON.parse(readFileSync(path.join(repoRoot, packageDir, 'package.json'), 'utf8')).scripts;
}

function buildCommands(job: Job): string[] {
  return job.steps.flatMap((step) => step.run?.match(/^npm run build\S*$/gm) ?? []);
}

describe('pull request checks workflow', () => {
  it.each([
    { jobId: 'build', name: 'build', packageDir: '.' },
    { jobId: 'probono-dashboard', name: 'Pro Bono dashboard', packageDir: 'apps/probono/dashboard' },
  ])('builds $packageDir the way production deploys it, once', ({ jobId, name, packageDir }) => {
    const job = workflow.jobs[jobId];

    expect(job.name).toBe(name);
    expect(buildCommands(job)).toEqual(['npm run build:cloudflare']);
    expect(scripts(packageDir)['build:cloudflare']).toContain('opennextjs-cloudflare build');
  });

  it('gives the builds a read-only token and no secrets', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(source).not.toMatch(/secrets\.|github\.token|GITHUB_TOKEN|CLOUDFLARE_/);
    for (const job of Object.values(workflow.jobs)) expect(job).not.toHaveProperty('permissions');
  });
});
