/* @vitest-environment node */

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCollection } from '../../../scripts/collect-run';
import { aphBillPage } from '@/lib/legislation/follow';
import { buildManualDecision, buildPolicy } from '@/test/factories';
import type { Development, SourceReview } from '@/types';
import type { WatchState } from './collect';
import { createHostGate, robotsFetcher } from './host-gate';
import type { WatchSource } from './sources';

const SOURCE: WatchSource = {
  id: 'cli-test-rss',
  bodyId: 'test-body',
  name: 'CLI test RSS source',
  jurisdiction: 'federal',
  category: 'regulator',
  url: 'https://www.example.gov.au/rss',
  kind: 'rss',
  schedule: 'daily',
  enabled: true,
  automation: 'automatic',
};

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Consultation opens on AI assurance guidance</title>
    <link>https://www.example.gov.au/media/ai-assurance-consultation</link>
    <pubDate>Thu, 09 Jul 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>
`;

const PAGE_HTML =
  '<html><body>Official AI assurance consultation details.</body></html>';

const digest = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

describe('collection CLI write path', () => {
  let rootDir: string;
  const registerFile = () => path.join(rootDir, 'data', 'policies.json');
  const readJson = <T>(...segments: string[]) =>
    JSON.parse(readFileSync(path.join(rootDir, ...segments), 'utf8')) as T;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'policai-collect-run-'));
    mkdirSync(path.join(rootDir, 'data'));
    mkdirSync(path.join(rootDir, 'public', 'data'), { recursive: true });
    writeFileSync(
      registerFile(),
      JSON.stringify([buildPolicy({ id: 'curated-policy' })], null, 2) + '\n',
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('persists developments and reviews but leaves the register byte-identical', async () => {
    const before = digest(registerFile());
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SOURCE.url) return new Response(RSS_XML, { status: 200 });
      if (url.startsWith('https://www.example.gov.au/media/')) {
        return new Response(PAGE_HTML, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    await runCollection({
      rootDir,
      sources: [SOURCE],
      dryRun: false,
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
      hostGate: createHostGate({
        hosts: {},
        refused: new Map(),
        fetchRobots: robotsFetcher({ fetchImpl }),
        now: Date.now,
        sleep: async () => {},
      }),
    });

    const developments = readJson<Development[]>('data', 'developments.json');
    const reviews = readJson<SourceReview[]>('data', 'source-reviews.json');
    expect(developments).toHaveLength(1);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      status: 'pending_review',
      createdBy: 'collector',
    });
    expect(readJson('data', 'watch-state.json')).toHaveProperty('seen');
    expect(readJson<WatchState>('data', 'watch-state.json').hosts).toEqual({
      'www.example.gov.au': expect.objectContaining({
        robots: expect.objectContaining({ status: 'absent' }),
        backoffUntil: null,
      }),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.example.gov.au/robots.txt',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Policai/1.0') }) }),
    );
    expect(readJson('public', 'data', 'meta.json')).toHaveProperty('collector');
    expect(digest(registerFile())).toBe(before);
  });

  it('does not write a manual source failure into automatic coverage', async () => {
    const manual: WatchSource = {
      ...SOURCE,
      id: 'accc-rss',
      name: 'ACCC — media releases',
      automation: buildManualDecision(),
      url: 'https://www.example.gov.au/accc',
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SOURCE.url) return new Response(RSS_XML, { status: 200 });
      if (url.startsWith('https://www.example.gov.au/media/')) {
        return new Response(PAGE_HTML, { status: 200 });
      }
      if (url === manual.url) return new Response('denied', { status: 403 });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    await runCollection({
      rootDir,
      sources: [SOURCE, manual],
      dryRun: false,
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
      hostGate: createHostGate({
        hosts: {},
        refused: new Map(),
        fetchRobots: robotsFetcher({ fetchImpl }),
        now: Date.now,
        sleep: async () => {},
      }),
    });

    const written = readJson<{
      collector: {
        health: string;
        lastRunSources: string[];
        lastRunErrors: string[];
        sourceResults: { sourceId: string; coverageEligible?: boolean; status: string }[];
      };
    }>('public', 'data', 'meta.json');
    expect(written.collector.health).toBe('healthy');
    expect(written.collector.lastRunSources).not.toContain('accc-rss');
    expect(written.collector.lastRunErrors.join('\n')).not.toContain('accc-rss');
    expect(
      written.collector.sourceResults.some(
        (result) => result.sourceId === 'accc-rss' && result.coverageEligible !== false,
      ),
    ).toBe(false);
  });

  it('installs the refused hosts from the catalog decisions on the default gate', async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    await runCollection({
      rootDir,
      sources: [
        { ...SOURCE, id: 'accc-probe', url: 'https://www.accc.gov.au/rss' },
        { ...SOURCE, id: 'cyber-probe', url: 'https://www.cyber.gov.au/rss' },
      ],
      dryRun: true,
      fetchImpl,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(requested.map((url) => new URL(url).host)).not.toEqual(
      expect.arrayContaining(['www.accc.gov.au']),
    );
    expect(requested.map((url) => new URL(url).host)).not.toEqual(
      expect.arrayContaining(['www.cyber.gov.au']),
    );
  });
  it('follows a tracked federal bill through the browser and stages its new stages without touching the register', async () => {
    const billUrl = aphBillPage('r7249');
    const bill = buildPolicy({
      id: 'privacy-bill',
      type: 'legislation',
      status: 'proposed',
      sourceUrl: billUrl,
      legislative: {
        kind: 'bill',
        ref: { register: 'aph', billId: 'r7249' },
        origin: 'government',
        events: [{ date: '2024-09-12', precision: 'day', event: { kind: 'introduced', chamber: 'lower' }, source: { url: billUrl } }],
      },
    });
    writeFileSync(registerFile(), JSON.stringify([bill], null, 2) + '\n');
    const before = digest(registerFile());
    const page = readFileSync(path.join(__dirname, '../legislation/__fixtures__/aph/r7249.html'), 'utf8');
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const browserFetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === billUrl
        ? new Response(page, { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;

    await runCollection({
      rootDir,
      sources: [],
      dryRun: false,
      fetchImpl,
      browserFetchImpl,
      now: () => new Date('2026-10-22T05:00:00.000Z'),
      hostGate: createHostGate({
        hosts: {},
        refused: new Map(),
        fetchRobots: robotsFetcher({ fetchImpl }),
        now: Date.now,
        sleep: async () => {},
      }),
    });

    const reviews = readJson<SourceReview[]>('data', 'source-reviews.json');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ targetPolicyId: 'privacy-bill', status: 'pending_review' });
    expect(reviews[0].legislativeUpdate?.added).toHaveLength(5);
    expect(readJson<WatchState>('data', 'watch-state.json').sourceHealth['track:privacy-bill']).toMatchObject({
      consecutiveFailures: 0,
    });
    expect(digest(registerFile())).toBe(before);
  });

  describe('with host state and an outbox', () => {
    let stateDir: string;
    const outbox = (dir = path.join(stateDir, 'next')) =>
      JSON.parse(readFileSync(path.join(dir, 'outbox.json'), 'utf8')) as {
        developments: Development[];
        sourceReviews: SourceReview[];
      };
    const promote = () => cpSync(path.join(stateDir, 'next'), stateDir, { recursive: true });
    const resetMain = () => {
      for (const file of ['developments.json', 'source-reviews.json', 'watch-state.json']) {
        rmSync(path.join(rootDir, 'data', file), { force: true });
      }
    };
    const collectOnce = (now: string) => {
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === SOURCE.url) return new Response(RSS_XML, { status: 200 });
        if (url.startsWith('https://www.example.gov.au/media/')) return new Response(PAGE_HTML, { status: 200 });
        return new Response('not found', { status: 404 });
      }) as unknown as typeof fetch;
      return runCollection({
        rootDir,
        sources: [SOURCE],
        dryRun: false,
        fetchImpl,
        now: () => new Date(now),
        stateDir,
        hostGate: createHostGate({
          hosts: {},
          refused: new Map(),
          fetchRobots: robotsFetcher({ fetchImpl }),
          now: Date.now,
          sleep: async () => {},
        }),
      });
    };

    beforeEach(() => {
      stateDir = mkdtempSync(path.join(tmpdir(), 'policai-collector-state-'));
    });
    afterEach(() => rmSync(stateDir, { recursive: true, force: true }));

    it('replays findings an unmerged run made onto a main that never received them', async () => {
      await collectOnce('2026-07-10T00:00:00.000Z');
      const [finding] = outbox().developments;
      expect(finding.url).toBe('https://www.example.gov.au/media/ai-assurance-consultation');
      expect(outbox().sourceReviews).toHaveLength(1);
      promote();
      resetMain();

      await collectOnce('2026-07-11T00:00:00.000Z');

      expect(readJson<Development[]>('data', 'developments.json').map((d) => d.id)).toEqual([finding.id]);
      expect(readJson<SourceReview[]>('data', 'source-reviews.json')).toHaveLength(1);
      expect(outbox().developments.map((d) => d.id)).toEqual([finding.id]);
      expect(readJson<WatchState>('data', 'watch-state.json').seen).toEqual(
        expect.objectContaining({ [finding.url]: expect.anything() }),
      );
    });

    it('drops a finding from the outbox once main carries it', async () => {
      await collectOnce('2026-07-10T00:00:00.000Z');
      promote();

      await collectOnce('2026-07-11T00:00:00.000Z');

      expect(outbox()).toEqual({ developments: [], sourceReviews: [] });
      expect(readJson<Development[]>('data', 'developments.json')).toHaveLength(1);
    });

    it('writes nothing to the promoted state itself', async () => {
      await collectOnce('2026-07-10T00:00:00.000Z');
      expect(() => readFileSync(path.join(stateDir, 'outbox.json'))).toThrow();
      expect(outbox().developments).toHaveLength(1);
    });
  });
});
