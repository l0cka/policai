/* @vitest-environment node */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCollection } from '../../../scripts/collect-run';
import type { Development, Policy, SourceEvidence, SourceReview, TimelineEvent } from '@/types';
import type { WatchState } from './collect';
import { createHostGate } from './host-gate';
import { WATCH_SOURCES } from './sources';

interface Capture {
  main: {
    watchState: WatchState;
    policies: Policy[];
    timeline: TimelineEvent[];
    sourceReviews: SourceReview[];
    developments: Development[];
  };
  host: {
    watchState: WatchState;
    outbox: { developments: Development[]; sourceReviews: SourceReview[] };
  };
  readings: Record<string, { evidence: SourceEvidence; earlierContentHashes: string[] }>;
}

const capture = JSON.parse(
  readFileSync(path.join(__dirname, '../../test/fixtures/collector/pr-723.json'), 'utf8'),
) as Capture;
const OVIC = ['ovic-enterprise-generative-ai', 'ovic-public-generative-ai'];
const SENATE = 'senate-ai-data-centres';
const sources = WATCH_SOURCES.filter((source) => source.id in capture.readings);
const NOW = '2026-11-13T19:30:00.000Z';

vi.mock('./fetch', async (original) => ({
  ...(await original<typeof import('./fetch')>()),
  retrieveSource: vi.fn(async (url: string) => {
    const source = sources.find((candidate) => candidate.url === url);
    if (!source) throw new Error(`Unexpected retrieval of ${url}`);
    const { evidence, earlierContentHashes } = capture.readings[source.id];
    return { evidence: { ...evidence, retrievedAt: NOW }, earlierContentHashes };
  }),
}));

describe('the run after collection PR #723', () => {
  let rootDir: string;
  let stateDir: string;
  const readJson = <T>(...segments: string[]) =>
    JSON.parse(readFileSync(path.join(...segments), 'utf8')) as T;
  const writeJson = (value: unknown, ...segments: string[]) =>
    writeFileSync(path.join(...segments), JSON.stringify(value));
  const ids = (items: readonly { id: string }[]) => items.map((item) => item.id).sort();

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'policai-pr-723-'));
    stateDir = mkdtempSync(path.join(tmpdir(), 'policai-pr-723-state-'));
    mkdirSync(path.join(rootDir, 'data'));
    mkdirSync(path.join(rootDir, 'public', 'data'), { recursive: true });
    writeJson(capture.main.watchState, rootDir, 'data', 'watch-state.json');
    writeJson(capture.main.policies, rootDir, 'data', 'policies.json');
    writeJson(capture.main.timeline, rootDir, 'data', 'timeline.json');
    writeJson(capture.main.sourceReviews, rootDir, 'data', 'source-reviews.json');
    writeJson(capture.main.developments, rootDir, 'data', 'developments.json');
    writeJson(capture.host.watchState, stateDir, 'watch-state.json');
    writeJson(capture.host.outbox, stateDir, 'outbox.json');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('retracts the four OVIC change reviews and keeps the Senate inquiry change', async () => {
    const ovicReviews = capture.host.outbox.sourceReviews.filter((review) =>
      OVIC.includes(review.linkedDevelopment?.sourceId ?? ''),
    );
    const [senateReview] = capture.host.outbox.sourceReviews.filter(
      (review) => review.linkedDevelopment?.sourceId === SENATE,
    );
    expect(ovicReviews.map((review) => review.sourceVersionSequence)).toEqual([2, 2, 2, 2]);
    expect(new Set(ovicReviews.map((review) => review.targetPolicyId)).size).toBe(2);
    expect(senateReview.sourceVersionSequence).toBe(14);

    await runCollection({
      rootDir,
      sources,
      dryRun: false,
      now: () => new Date(NOW),
      stateDir,
      hostGate: createHostGate({
        hosts: {},
        refused: new Map(),
        fetchRobots: async () => ({ status: 404, body: '' }) as never,
        now: Date.now,
        sleep: async () => {},
      }),
    });

    expect(process.exitCode ?? 0).toBe(0);
    expect(ids(readJson<SourceReview[]>(rootDir, 'data', 'source-reviews.json'))).toEqual(
      ids([...capture.main.sourceReviews, senateReview]),
    );
    expect(ids(readJson<Development[]>(rootDir, 'data', 'developments.json'))).toEqual(
      ids([...capture.main.developments, senateReview.linkedDevelopment as Development]),
    );
    const outbox = readJson<Capture['host']['outbox']>(stateDir, 'next', 'outbox.json');
    expect(ids(outbox.sourceReviews)).toEqual([senateReview.id]);
    expect(ids(outbox.developments)).toEqual([senateReview.linkedDevelopment?.id]);

    const state = readJson<WatchState>(rootDir, 'data', 'watch-state.json');
    for (const id of OVIC) {
      expect(state.sourceSnapshots?.[id]).toEqual({
        ...capture.main.watchState.sourceSnapshots?.[id],
        lastCheckedAt: NOW,
      });
      expect(Object.entries(state.seen).filter(([, entry]) => entry.sourceId === id)).toEqual(
        Object.entries(capture.main.watchState.seen).filter(([, entry]) => entry.sourceId === id),
      );
    }
    expect(state.sourceSnapshots?.[SENATE]).toMatchObject({
      contentHash: senateReview.sourceEvidence.contentHash,
      changeCount: 14,
    });
  });
});
