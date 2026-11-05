/* @vitest-environment node */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPolicy, buildTimelineEvent } from '@/test/factories';
import type { Development, TimelineEvent } from '@/types';

const repoRoot = process.cwd();
const NOW = '2026-11-20T00:00:00.000Z';
const OVERDUE = '2026-08-01T00:00:00.000Z';
const CURRENT = '2026-11-01T00:00:00.000Z';
let workDir: string | undefined;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
});

function event(id: string, checkedAt: string): TimelineEvent {
  const base = buildTimelineEvent({ id, sourceUrl: `https://example.gov.au/${id}` });
  return { ...base, verification: { ...base.verification, checkedAt } };
}

function development(id: string, checkedAt: string, verified: boolean): Development {
  const url = `https://example.gov.au/${id}`;
  return {
    id,
    title: `Development ${id}`,
    url,
    sourceId: 'editorial-test',
    sourceName: 'Example agency',
    jurisdiction: 'federal',
    publishedAt: '2026-06-01',
    detectedAt: '2026-06-02T00:00:00.000Z',
    relevanceScore: verified ? 1 : 0.5,
    classification: verified ? 'curated' : 'heuristic',
    assessment: { method: verified ? 'editorial' : 'heuristic', assessedAt: checkedAt },
    verification: verified
      ? {
          status: 'verified',
          method: 'manual',
          checkedAt,
          checkedBy: 'Daniel Alkurdi',
          source: { url, contentHash: 'b'.repeat(64) },
        }
      : { status: 'needs_review', source: { url } },
    status: verified ? 'promoted' : 'detected',
  } as Development;
}

function runCheckFreshness(budget: Record<string, number>, args: string[] = []) {
  workDir = mkdtempSync(path.join(os.tmpdir(), 'policai-check-freshness-'));
  const data = path.join(workDir, 'data');
  mkdirSync(data);
  const policy = buildPolicy({ id: 'current-policy' });
  writeFileSync(
    path.join(data, 'policies.json'),
    JSON.stringify([{ ...policy, verification: { ...policy.verification, checkedAt: CURRENT } }]),
  );
  writeFileSync(
    path.join(data, 'timeline.json'),
    JSON.stringify([event('tl-overdue', OVERDUE), event('tl-current', CURRENT)]),
  );
  writeFileSync(
    path.join(data, 'developments.json'),
    JSON.stringify([
      development('dev-feed-overdue', OVERDUE, true),
      development('dev-feed-current', CURRENT, true),
      // An unverified detection shows "Needs review"; it never falls due.
      development('dev-detected', OVERDUE, false),
    ]),
  );
  writeFileSync(path.join(data, 'freshness-budget.json'), JSON.stringify(budget));
  return spawnSync(
    path.join(repoRoot, 'node_modules', '.bin', 'tsx'),
    [
      '--tsconfig',
      path.join(repoRoot, 'tsconfig.json'),
      path.join(repoRoot, 'scripts', 'check-freshness.ts'),
      `--now=${NOW}`,
      ...args,
    ],
    { cwd: workDir, encoding: 'utf8' },
  );
}

describe('scripts/check-freshness.ts', () => {
  it('reports overdue timeline events and editor-verified developments by the badge rule', () => {
    const result = runCheckFreshness(
      { maxOverdueRecords: 0, maxOverdueTimelineEvents: 1, maxOverdueDevelopments: 1 },
      ['--json'],
    );

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.policies).toMatchObject({ total: 1, overdue: [], passed: true });
    expect(report.timelineEvents).toMatchObject({
      total: 2,
      overdue: [{ id: 'tl-overdue', dueAt: '2026-10-30T00:00:00.000Z' }],
      budget: 1,
      passed: true,
    });
    expect(report.developments).toMatchObject({
      total: 2,
      overdue: [{ id: 'dev-feed-overdue' }],
      passed: true,
    });
  }, 60_000);

  it('fails when overdue timeline events exceed their budget', () => {
    const result = runCheckFreshness({
      maxOverdueRecords: 0,
      maxOverdueTimelineEvents: 0,
      maxOverdueDevelopments: 1,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('1 of 2 public timeline events overdue (budget 0, maxOverdueTimelineEvents).');
    expect(result.stdout).toContain('  overdue  tl-overdue (due 2026-10-30)');
    expect(result.stderr).toContain('Freshness budget exceeded for public timeline events');
  }, 60_000);

  it('refuses a budget file without a timeline or development budget', () => {
    const result = runCheckFreshness({ maxOverdueRecords: 0 });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('"maxOverdueTimelineEvents"');
  }, 60_000);
});
