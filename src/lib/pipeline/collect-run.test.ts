/* @vitest-environment node */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCollection } from '../../../scripts/collect-run';
import { buildManualDecision, buildPolicy } from '@/test/factories';
import type { Development, SourceReview } from '@/types';
import type { WatchState } from './collect';
import { createHostGate, robotsFetcher } from './host-gate';
import type { WatchSource } from './sources';

const SOURCE: WatchSource = {
  id: 'cli-test-rss',
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
});
