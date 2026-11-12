/* @vitest-environment node */

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCollection, withoutInvalidChanges } from '../../../scripts/collect-run';
import { aphBillPage } from '@/lib/legislation/follow';
import { buildManualDecision, buildPolicy } from '@/test/factories';
import { publicAutomaticCollectionMeta } from '@/lib/collection-coverage';
import type { CollectionMeta, Development, SourceReview } from '@/types';
import type { WatchState } from './collect';
import { createHostGate, robotsFetcher } from './host-gate';
import { retrieveSource } from './fetch';
import { WATCH_SOURCES, type WatchSource } from './sources';

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

    const written = readJson<CollectionMeta>('public', 'data', 'meta.json');
    expect(written.collector.lastRunSources).not.toContain('accc-rss');
    expect(written.collector.lastRunErrors.join('\n')).not.toMatch(/accc-rss: HTTP 403/);
    // dta-media is an unreviewed manual source: /status shows it, but it
    // adds no run error and does not degrade health.
    expect(written.collector.lastRunErrors.join('\n')).not.toMatch(/dta-media: unchecked/);
    expect(publicAutomaticCollectionMeta(written, WATCH_SOURCES)).toEqual(written);
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
  it('follows a proposed bill on every run and an Act weekly, and stages new stages without touching the register', async () => {
    const billUrl = aphBillPage('r7249');
    const actUrl = aphBillPage('r7001');
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
    const act = buildPolicy({
      id: 'settled-act',
      type: 'legislation',
      status: 'active',
      sourceUrl: actUrl,
      legislative: {
        kind: 'bill',
        ref: { register: 'aph', billId: 'r7001' },
        origin: 'government',
        events: [
          { date: '2024-01-01', precision: 'day', event: { kind: 'introduced', chamber: 'lower' }, source: { url: actUrl } },
          { date: '2024-02-01', precision: 'day', event: { kind: 'passed', chamber: 'lower' }, source: { url: actUrl } },
          { date: '2024-03-01', precision: 'day', event: { kind: 'passed', chamber: 'upper' }, source: { url: actUrl } },
          { date: '2024-04-01', precision: 'day', event: { kind: 'assented', actCitation: 'Act No. 1 of 2024' }, source: { url: actUrl } },
        ],
      },
    });
    const actPage = `<div id="main_0_mainDiv"><h1>Settled Act 2024</h1><table><thead><tr><th>House of Representatives</th></tr></thead><tbody>
      <tr><td><span>Introduced and read a first time</span></td><td>01 Jan 2024</td></tr>
      <tr><td><span>Third reading agreed to</span></td><td>01 Feb 2024</td></tr>
      </tbody></table>
      <table><thead><tr><th>Senate</th></tr></thead><tbody>
      <tr><td><span>Third reading agreed to</span></td><td>01 Mar 2024</td></tr>
      </tbody></table>
      <table><thead><tr><th></th></tr></thead><tbody>
      <tr><td><span>Assent</span><ul><li><span>Act no</span>: <span>1</span></li><li><span>Year</span>: <span>2024</span></li></ul></td><td>01 Apr 2024</td></tr>
      </tbody></table></div>`;
    writeFileSync(registerFile(), JSON.stringify([bill, act], null, 2) + '\n');
    const before = digest(registerFile());
    const page = readFileSync(path.join(__dirname, '../legislation/__fixtures__/aph/r7249.html'), 'utf8');
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const browserFetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === billUrl) return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url === actUrl) return new Response(actPage, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const followAt = (now: string) =>
      runCollection({
        rootDir,
        sources: [],
        dryRun: false,
        fetchImpl,
        browserFetchImpl,
        now: () => new Date(now),
        hostGate: createHostGate({
          hosts: {},
          refused: new Map(),
          fetchRobots: robotsFetcher({ fetchImpl }),
          now: Date.now,
          sleep: async () => {},
        }),
      });
    const readsOf = (url: string) => vi.mocked(browserFetchImpl).mock.calls.filter(([input]) => String(input) === url).length;

    const decideStagedUpdate = () => writeFileSync(path.join(rootDir, 'data', 'source-reviews.json'), '[]\n');

    await followAt('2026-10-22T05:00:00.000Z');
    expect(readsOf(billUrl)).toBe(1);
    expect(readsOf(actUrl)).toBe(1);
    decideStagedUpdate();
    await followAt('2026-10-25T05:00:00.000Z');
    expect(readsOf(billUrl)).toBe(2);
    expect(readsOf(actUrl)).toBe(1);
    await followAt('2026-10-29T05:00:00.000Z');
    expect(readsOf(billUrl)).toBe(3);
    expect(readsOf(actUrl)).toBe(2);

    const reviews = readJson<SourceReview[]>('data', 'source-reviews.json');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ targetPolicyId: 'privacy-bill', status: 'pending_review' });
    expect(reviews[0].legislativeUpdate?.added).toHaveLength(5);
    expect(readJson<WatchState>('data', 'watch-state.json').sourceHealth['track:privacy-bill']).toMatchObject({
      consecutiveFailures: 0,
    });
    expect(digest(registerFile())).toBe(before);
  });

  it('reads a bill page that links more policy documents than a document source may fold', async () => {
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
    const documents = Array.from(
      { length: 12 },
      (_, index) => `<a href="https://parlinfo.aph.gov.au/legislation/ems/r7249_em_${index}.pdf">Explanatory memorandum to the legislation ${index}</a>`,
    ).join('');
    const page = readFileSync(path.join(__dirname, '../legislation/__fixtures__/aph/r7249.html'), 'utf8')
      + documents;
    expect(page).toContain('r7249_em_11.pdf');
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

    expect(readJson<CollectionMeta>('public', 'data', 'meta.json').collector.lastRunErrors).not.toEqual(
      expect.arrayContaining([expect.stringContaining('track:privacy-bill')]),
    );
    expect(readJson<SourceReview[]>('data', 'source-reviews.json')[0]).toMatchObject({
      targetPolicyId: 'privacy-bill',
      status: 'pending_review',
    });
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

    it('drops an invalid carried finding and publishes the rest', async () => {
      await collectOnce('2026-07-10T00:00:00.000Z');
      const [finding] = outbox().developments;
      const carried = outbox();
      carried.developments.push({ ...finding, id: 'bad-finding', url: 'http://www.example.gov.au/media/x' });
      promote();
      writeFileSync(path.join(stateDir, 'outbox.json'), JSON.stringify(carried));
      resetMain();
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await collectOnce('2026-07-11T00:00:00.000Z');

      expect(readJson<Development[]>('data', 'developments.json').map((d) => d.id)).toEqual([finding.id]);
      expect(outbox().developments.map((d) => d.id)).toEqual([finding.id]);
      expect(
        readJson<{ collector: { lastRunErrors: string[] } }>('public', 'data', 'meta.json').collector.lastRunErrors,
      ).toEqual(expect.arrayContaining([expect.stringMatching(/^dropped invalid record bad-finding: /)]));
    });

    describe('a weekly document source tracked by a register record', () => {
      const DOCUMENT: WatchSource = {
        id: 'cli-test-document',
        bodyId: 'test-body',
        name: 'CLI test guidance page',
        jurisdiction: 'vic',
        category: 'regulator',
        url: 'https://www.example.gov.au/guidance/generative-ai',
        kind: 'document',
        schedule: 'weekly',
        enabled: true,
        automation: 'automatic',
      };
      const FIRST_READ = '2026-07-23T20:36:08.370Z';
      const EDITOR_CAPTURE = '2026-11-05T22:01:46.862Z';
      const page = (text: string) =>
        `<html><head></head><body><main><h1>Generative AI guidance</h1><p>${text}</p></main></body></html>`;
      const documentFetch = (text: string) =>
        vi.fn(async (input: RequestInfo | URL) =>
          String(input) === DOCUMENT.url
            ? new Response(page(text), { status: 200, headers: { 'content-type': 'text/html' } })
            : new Response('not found', { status: 404 }),
        ) as unknown as typeof fetch;
      const reading = async (text: string) => {
        const retrieved = await retrieveSource(DOCUMENT.url, { fetchImpl: documentFetch(text) });
        return {
          current: retrieved.evidence.contentHash as string,
          legacy: retrieved.earlierContentHashes?.[1] as string,
        };
      };
      const transitionKey = (hash: string, sequence: number) =>
        `${DOCUMENT.url}#policai-change=${hash}:${sequence}`;
      const trackedPolicy = (retrievedAt: string) =>
        buildPolicy({
          id: 'tracked-guidance',
          title: 'Generative AI guidance',
          jurisdiction: 'vic',
          sourceUrl: DOCUMENT.url,
          verification: {
            status: 'verified',
            checkedAt: retrievedAt,
            checkedBy: 'reviewer',
            method: 'manual',
            source: { url: DOCUMENT.url, contentHash: 'd'.repeat(64), retrievedAt },
          },
        });
      const writeRegister = (retrievedAt: string) =>
        writeFileSync(registerFile(), JSON.stringify([trackedPolicy(retrievedAt)], null, 2) + '\n');
      const seedMainState = async (text: string) => {
        const { current, legacy } = await reading(text);
        const state: WatchState = {
          seen: {
            [transitionKey(legacy, 1)]: {
              firstSeenAt: FIRST_READ,
              sourceId: DOCUMENT.id,
              status: 'processed',
              processedAt: FIRST_READ,
              candidate: {
                title: 'Generative AI guidance',
                url: DOCUMENT.url,
                text: '',
                changeFingerprint: `${legacy}:1`,
              },
            },
          },
          lastCheckedBySource: { [DOCUMENT.id]: '2026-11-05T19:30:18.660Z' },
          sourceSnapshots: {
            [DOCUMENT.id]: {
              contentHash: current,
              firstCheckedAt: FIRST_READ,
              lastCheckedAt: '2026-11-05T19:30:18.660Z',
              lastChangedAt: FIRST_READ,
              changeCount: 1,
            },
          },
          hosts: {},
          sourceHealth: {},
        };
        writeFileSync(path.join(rootDir, 'data', 'watch-state.json'), JSON.stringify(state));
        return { current, legacy, state };
      };
      const collectDocument = (now: string, text: string) => {
        const fetchImpl = documentFetch(text);
        return runCollection({
          rootDir,
          sources: [DOCUMENT],
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
      const restoreMain = (state: WatchState) => {
        resetMain();
        writeFileSync(path.join(rootDir, 'data', 'watch-state.json'), JSON.stringify(state));
      };
      const pendingReviews = () =>
        (existsSync(path.join(rootDir, 'data', 'source-reviews.json'))
          ? readJson<SourceReview[]>('data', 'source-reviews.json')
          : []
        ).filter((review) => review.status === 'pending_review');
      const stageFalseChange = async () => {
        const seeded = await seedMainState('Version one.');
        writeRegister('2026-07-01T00:00:00.000Z');
        await collectDocument('2026-11-11T19:34:38.995Z', 'Version one.');
        expect(outbox().sourceReviews.map((review) => review.sourceVersionSequence)).toEqual([2]);
        expect(outbox().sourceReviews[0].sourceEvidence.contentHash).toBe(seeded.current);
        const staged = JSON.parse(
          readFileSync(path.join(stateDir, 'next', 'watch-state.json'), 'utf8'),
        ) as WatchState;
        expect(staged.sourceSnapshots?.[DOCUMENT.id]).toMatchObject({
          contentHash: seeded.current,
          lastChangedAt: '2026-11-11T19:34:38.995Z',
          changeCount: 2,
        });
        expect(staged.seen[transitionKey(seeded.legacy, 2)].status).toBe('processed');
        promote();
        restoreMain(seeded.state);
        writeRegister(EDITOR_CAPTURE);
        return seeded;
      };

      it('retracts a change an earlier run staged for an unchanged page the editor verified since the collector first read it', async () => {
        const seeded = await stageFalseChange();

        for (const now of ['2026-11-12T19:30:36.269Z', '2026-11-13T19:30:00.000Z']) {
          await collectDocument(now, 'Version one.');

          expect(pendingReviews()).toEqual([]);
          expect(readJson<Development[]>('data', 'developments.json')).toEqual([]);
          expect(outbox()).toEqual({ developments: [], sourceReviews: [] });
          const state = readJson<WatchState>('data', 'watch-state.json');
          expect(state.sourceSnapshots?.[DOCUMENT.id]).toEqual({
            contentHash: seeded.current,
            firstCheckedAt: FIRST_READ,
            lastCheckedAt: '2026-11-12T19:30:36.269Z',
            lastChangedAt: FIRST_READ,
            changeCount: 1,
          });
          expect(Object.keys(state.seen)).toEqual([transitionKey(seeded.legacy, 1)]);
          promote();
          restoreMain(seeded.state);
        }
      });

      it('keeps one pending review for a version when the unmerged run that staged it is replayed', async () => {
        await seedMainState('Version one.');
        writeRegister('2026-07-01T00:00:00.000Z');
        await collectDocument('2026-11-11T19:34:38.995Z', 'Version one.');
        const [staged] = outbox().sourceReviews;
        const main = readJson<WatchState>('data', 'watch-state.json');

        for (const now of ['2026-11-12T19:30:36.269Z', '2026-11-13T19:30:00.000Z']) {
          promote();
          restoreMain(main);
          await collectDocument(now, 'Version one.');

          expect(pendingReviews().map((review) => review.id)).toEqual([staged.id]);
          expect(outbox().sourceReviews.map((review) => review.id)).toEqual([staged.id]);
          expect(outbox().developments.map((development) => development.id)).toEqual([
            staged.linkedDevelopment?.id,
          ]);
        }
      });

      it('stages one review for a real change after a retracted one and keeps it through a replay', async () => {
        const seeded = await stageFalseChange();
        await collectDocument('2026-11-12T19:30:36.269Z', 'Version one.');
        promote();
        restoreMain(seeded.state);
        const changed = await reading('Version two.');

        await collectDocument('2026-11-19T19:30:00.000Z', 'Version two.');

        expect(pendingReviews()).toHaveLength(1);
        expect(pendingReviews()[0]).toMatchObject({
          targetPolicyId: 'tracked-guidance',
          sourceVersionSequence: 2,
          sourceEvidence: { contentHash: changed.current },
        });
        const [real] = pendingReviews();
        promote();
        restoreMain(seeded.state);

        await collectDocument('2026-11-20T19:30:00.000Z', 'Version two.');

        expect(pendingReviews().map((review) => review.id)).toEqual([real.id]);
        expect(readJson<WatchState>('data', 'watch-state.json').sourceSnapshots?.[DOCUMENT.id]).toMatchObject({
          contentHash: changed.current,
          changeCount: 2,
        });
      });

      it('stages the next real change once beside a pending review main already carries, and keeps both through a replay', async () => {
        await seedMainState('Version one.');
        writeRegister(EDITOR_CAPTURE);
        await collectDocument('2026-11-12T19:30:36.269Z', 'Version two.');
        const [merged] = pendingReviews();
        expect(merged.sourceVersionSequence).toBe(2);
        promote();
        const main = readJson<WatchState>('data', 'watch-state.json');
        const mainReviews = readFileSync(path.join(rootDir, 'data', 'source-reviews.json'), 'utf8');
        const mainDevelopments = readFileSync(path.join(rootDir, 'data', 'developments.json'), 'utf8');
        const changed = await reading('Version three.');

        await collectDocument('2026-11-13T19:30:00.000Z', 'Version three.');

        const sequences = () =>
          pendingReviews()
            .map((review) => [review.sourceVersionSequence, review.sourceEvidence.contentHash])
            .sort();
        expect(sequences()).toEqual([
          [2, merged.sourceEvidence.contentHash],
          [3, changed.current],
        ]);
        const next = pendingReviews().find((review) => review.sourceVersionSequence === 3) as SourceReview;
        promote();
        restoreMain(main);
        writeFileSync(path.join(rootDir, 'data', 'source-reviews.json'), mainReviews);
        writeFileSync(path.join(rootDir, 'data', 'developments.json'), mainDevelopments);

        await collectDocument('2026-11-14T19:30:00.000Z', 'Version three.');

        expect(sequences()).toEqual([
          [2, merged.sourceEvidence.contentHash],
          [3, changed.current],
        ]);
        expect(outbox().sourceReviews.map((review) => review.id)).toEqual([next.id]);
      });
    });

    it('writes nothing to the promoted state itself', async () => {
      await collectOnce('2026-07-10T00:00:00.000Z');
      expect(() => readFileSync(path.join(stateDir, 'outbox.json'))).toThrow();
      expect(outbox().developments).toHaveLength(1);
    });
  });
});

describe('withoutInvalidChanges', () => {
  type Row = { id: string; ok: boolean };
  const validate = (items: Row[]) => ({
    errors: items.filter((item) => !item.ok).map((item) => `${item.id}: not ok`),
    warnings: [],
  });

  it('keeps records main already has, even invalid ones', () => {
    const main = [{ id: 'legacy', ok: false }];
    expect(withoutInvalidChanges(main, [{ id: 'legacy', ok: false }, { id: 'new', ok: true }], validate)).toEqual({
      items: [{ id: 'legacy', ok: false }, { id: 'new', ok: true }],
      dropped: [],
    });
  });

  it('fails when a validation error names no record', () => {
    const run = () => withoutInvalidChanges([], [{ id: 'a', ok: true }], () => ({ errors: ['duplicate ids'], warnings: [] }));
    expect(run).toThrow(/not attributable to a record: duplicate ids/);
  });

  it('reverts a rejected change to main and drops a rejected new record', () => {
    const main = [{ id: 'kept', ok: true }];
    expect(withoutInvalidChanges(main, [{ id: 'kept', ok: false }, { id: 'new', ok: false }], validate)).toEqual({
      items: [{ id: 'kept', ok: true }],
      dropped: ['kept: not ok', 'new: not ok'],
    });
  });
});
