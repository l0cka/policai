/* @vitest-environment node */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { scrapeWithFirecrawl } = vi.hoisted(() => ({
  scrapeWithFirecrawl: vi.fn(async () => ({ ok: false as const, reason: 'unavailable', detail: 'harness' })),
}));
vi.mock('./firecrawl', () => ({ scrapeWithFirecrawl }));
vi.mock('./claude-classify', () => ({ classifyBatch: vi.fn(), CLAUDE_BATCH_SIZE: 20 }));

import { collect, collectionRunFailed, emptyWatchState, type WatchState } from './collect';
import { createHostGate, type HostGate } from './host-gate';
import type { WatchSource } from './sources';
import type { CollectionMeta, SourceRunResult } from '@/types';

const base = { jurisdiction: 'federal', category: 'government', enabled: true, automation: 'automatic' } as const;
const HTML: WatchSource = { ...base, id: 'p-html', name: 'P HTML', url: 'https://www.example.gov.au/news', kind: 'html-index', schedule: 'daily' };
const RSS: WatchSource = { ...base, id: 'p-rss', name: 'P RSS', url: 'https://www.example.gov.au/rss', kind: 'rss', schedule: 'daily' };
const DOC: WatchSource = { ...base, id: 'p-doc', name: 'P AI governance policy', url: 'https://www.example.gov.au/policy/ai-governance', kind: 'document', schedule: 'daily' };
const WEEKLY: WatchSource = { ...base, id: 'p-weekly', name: 'P weekly', url: 'https://www.example.gov.au/weekly', kind: 'rss', schedule: 'weekly' };
const OTHER: WatchSource = { ...base, id: 'p-other', name: 'P other', url: 'https://www.other.gov.au/rss', kind: 'rss', schedule: 'daily' };
const SOURCES = [HTML, RSS, DOC, WEEKLY, OTHER];

const INDEX_HTML =
  '<html><body><main><ul class="news-list"><li><a href="/news/ai-policy-framework">New AI policy framework released</a></li><li><a href="/news/ai-ethics-guidance">AI ethics guidance for agencies</a></li></ul></main></body></html>';
const rssXml = (host: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Consultation opens on AI assurance guidance</title><link>https://${host}/media/ai-assurance-consultation</link><pubDate>Thu, 09 Jul 2026 01:00:00 GMT</pubDate></item></channel></rss>`;
const article = (title: string) =>
  `<html><body><h1>${title}</h1><p>The artificial intelligence policy framework sets requirements for AI governance, AI assurance and automated decision making in agencies.</p></body></html>`;

type Outcome = 'ok' | 403 | 404 | 429 | 503 | 'h2' | 'throw' | 'empty' | '429ra' | '503ra';
const INDEX_OUTCOMES: Outcome[] = ['ok', 403, 503, 'throw', 'empty', '429ra', '503ra'];
const CANDIDATE_OUTCOMES: Outcome[] = ['ok', 403, 503, 'h2', 429];
const ALL_OK = { html: 'ok', htmlC: 'ok', rss: 'ok', rssC: 'ok', doc: 'ok' } as const;
type Scenario = Record<'html' | 'htmlC' | 'rss' | 'rssC' | 'doc', Outcome>;

interface Request {
  transport: 'http' | 'browser';
  url: string;
  status: number | null;
  retryAfter: string | null;
}

function respond(outcome: Outcome, url: string, okBody: string, contentType = 'text/html'): Response {
  if (outcome === 'ok') return new Response(okBody, { status: 200, headers: { 'content-type': contentType } });
  if (outcome === 'empty') return new Response('<html><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (outcome === 'h2') throw new Error(`page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at ${url}\nCall log:\n  - navigating to "${url}", waiting until "load"`);
  if (outcome === 'throw') throw new TypeError('fetch failed');
  if (outcome === '429ra') return new Response('slow', { status: 429, headers: { 'retry-after': '5' } });
  if (outcome === '503ra') return new Response('maintenance', { status: 503, headers: { 'retry-after': '7200' } });
  return new Response('error', { status: outcome });
}

function fetchFor(scenario: Scenario, transport: Request['transport'], requests: Request[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const record = (outcome: Outcome, body: string, contentType?: string) => {
      try {
        const response = respond(outcome, url, body, contentType);
        requests.push({ transport, url, status: response.status, retryAfter: response.headers.get('retry-after') });
        return response;
      } catch (error) {
        requests.push({ transport, url, status: null, retryAfter: null });
        throw error;
      }
    };
    if (url.startsWith('https://www.other.gov.au/rss')) return record('ok', rssXml('www.other.gov.au'), 'application/rss+xml');
    if (url.startsWith('https://www.other.gov.au/media/')) return record('ok', article('Consultation opens on AI assurance guidance'));
    if (url.startsWith('https://www.example.gov.au/news/ai-ethics')) return record('ok', article('AI ethics guidance for agencies'));
    if (url.startsWith('https://www.example.gov.au/news/')) return record(scenario.htmlC, article('New AI policy framework released'));
    if (url.startsWith('https://www.example.gov.au/news')) return record(scenario.html, INDEX_HTML);
    if (url.startsWith('https://www.example.gov.au/media/')) return record(scenario.rssC, article('Consultation opens on AI assurance guidance'));
    if (url.startsWith('https://www.example.gov.au/rss')) return record(scenario.rss, rssXml('www.example.gov.au'), 'application/rss+xml');
    if (url.startsWith('https://www.example.gov.au/weekly')) return record('ok', rssXml('www.example.gov.au'), 'application/rss+xml');
    if (url.startsWith(DOC.url)) return record(scenario.doc, article('AI governance policy'));
    requests.push({ transport, url, status: 404, retryAfter: null });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

type RobotsResponse = { status: number; body: string } | null;
const ROBOTS: Record<string, RobotsResponse> = {
  absent: { status: 404, body: '' },
  'crawl-delay 10': { status: 200, body: 'User-agent: *\nCrawl-delay: 10\nDisallow: /private\n' },
  unreachable: null,
};
const DISALLOW_NEWS = 'User-agent: Policai\nDisallow: /news/\n\nUser-agent: *\nDisallow: /\n';

const NEUTRAL: HostGate = {
  admit: async () => ({ kind: 'go' }),
  observe: () => undefined,
  hosts: () => ({}),
  waited: () => ({}),
};

interface RunOutcome {
  errors: string[];
  health: string;
  counts: unknown[];
  lastHealthyAt: string | null;
  failedGlobal: boolean;
  failedTargeted: boolean;
  rows: Array<Omit<SourceRunResult, 'durationMs'>>;
  stateSeen: Record<string, unknown[]>;
  devUrls: string[];
  reviewUrls: string[];
  lastChecked: Record<string, string>;
  hostTakenOut: boolean;
}

async function runDays(
  scenario: Scenario,
  browser: boolean,
  gateFor: (hosts: WatchState['hosts'], clock: { t: number }) => HostGate,
  requests: Request[],
): Promise<RunOutcome[]> {
  let state: WatchState = emptyWatchState();
  state.lastCheckedBySource[WEEKLY.id] = '2026-07-09T00:00:00.000Z';
  const outcomes: RunOutcome[] = [];
  for (let day = 0; day < 4; day++) {
    const now = new Date(Date.UTC(2026, 6, 10 + day));
    const clock = { t: now.getTime() };
    const dayRequests: Request[] = [];
    const active = day === 3 ? ALL_OK : scenario;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = collect({
      sources: SOURCES,
      state,
      existingDevelopments: [],
      fetchImpl: fetchFor(active, 'http', dayRequests),
      ...(browser ? { browserFetchImpl: fetchFor(active, 'browser', dayRequests) } : {}),
      now: () => now,
      hostGate: gateFor(state.hosts, clock),
      logger: () => undefined,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();
    requests.push(...dayRequests);
    state = result.state;
    const collector = result.meta.collector;
    outcomes.push({
      errors: result.errors,
      health: collector.health,
      counts: [collector.dueSourceCount, collector.successfulSourceCount, collector.failedSourceCount, collector.skippedSourceCount, collector.successRate],
      lastHealthyAt: result.meta.lastHealthyAt,
      failedGlobal: collectionRunFailed(collector.health, result.errors, false),
      failedTargeted: collectionRunFailed(collector.health, result.errors, true),
      rows: collector.sourceResults.map((row) => {
        const { durationMs, ...rest } = row;
        void durationMs;
        return rest;
      }),
      stateSeen: Object.fromEntries(
        Object.entries(result.state.seen).map(([key, entry]) => [key, [entry.status, entry.attempts, entry.lastError]]),
      ),
      devUrls: result.developments.map((development) => development.url).sort(),
      reviewUrls: result.reviewCandidates.map((review) => review.sourceUrl).sort(),
      lastChecked: result.state.lastCheckedBySource,
      hostTakenOut: dayRequests.some(
        (request) =>
          (request.transport === 'browser' && request.status === 403) ||
          (request.status === 429 && (request.retryAfter === null || Number(request.retryAfter) > 30)) ||
          (request.status === 503 && request.retryAfter !== null && Number(request.retryAfter) > 30),
      ),
    });
  }
  return outcomes;
}

function realGate(robots: RobotsResponse, waitBudgetMs?: number) {
  return (hosts: WatchState['hosts'], clock: { t: number }) =>
    createHostGate({
      hosts,
      refused: new Map(),
      fetchRobots: async () => robots,
      now: () => clock.t,
      sleep: async (ms) => {
        clock.t += ms;
      },
      ...(waitBudgetMs === undefined ? {} : { waitBudgetMs }),
    });
}

const REVIEW_GATE = path.join(process.cwd(), 'ops', 'collector', 'collection_review_gate.py');
const REVIEW_GATE_COVERAGE = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('collection_review_gate', sys.argv[1])
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
data = json.load(open(sys.argv[2]))
result = {'reasons': []}
try:
    gate.coverage_rows(data['meta'], data['coverage'], 'head', result)
except gate.Refused as error:
    result['reasons'].append(str(error))
print(json.dumps(result['reasons']))
`;

function reviewGateReasons(meta: CollectionMeta, due: Record<string, boolean>): string[] {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'policai-review-gate-'));
  try {
    const input = path.join(dir, 'input.json');
    const coverage = {
      head_automatic_source_ids: Object.keys(due),
      head_manual_source_count: 0,
      head_due: due,
    };
    writeFileSync(input, JSON.stringify({ meta, coverage }));
    const run = spawnSync('python3', ['-I', '-B', '-c', REVIEW_GATE_COVERAGE, REVIEW_GATE, input], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    return JSON.parse(run.stdout) as string[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const skippedIds = (outcome: RunOutcome) =>
  outcome.rows.filter((row) => row.status === 'skipped').map((row) => row.sourceId);

function* scenarios(): Generator<[Scenario, boolean]> {
  let n = 0;
  for (const html of INDEX_OUTCOMES) {
    for (const htmlC of CANDIDATE_OUTCOMES) {
      const rss = INDEX_OUTCOMES[(n * 3) % INDEX_OUTCOMES.length];
      const rssC = CANDIDATE_OUTCOMES[(n * 5 + 1) % CANDIDATE_OUTCOMES.length];
      const doc = INDEX_OUTCOMES[(n * 7 + 2) % INDEX_OUTCOMES.length];
      n++;
      for (const browser of [false, true]) yield [{ html, htmlC, rss, rssC, doc }, browser];
    }
  }
}

const failedKeys = (outcome: RunOutcome) =>
  Object.entries(outcome.stateSeen)
    .filter(([, [status]]) => status === 'failed')
    .map(([key]) => key)
    .sort();

describe('the gate never makes a run worse than a neutral gate', () => {
  const neutralRuns = new Map<string, RunOutcome[]>();

  it.each(Object.entries(ROBOTS))('with robots.txt %s every run matches the neutral gate until a host asks to be left alone', async (_label, robots) => {
    let compared = 0;
    for (const [scenario, browser] of scenarios()) {
      const key = JSON.stringify([scenario, browser]);
      let neutral = neutralRuns.get(key);
      if (!neutral) {
        neutral = await runDays(scenario, browser, () => NEUTRAL, []);
        neutralRuns.set(key, neutral);
      }
      const gated = await runDays(scenario, browser, realGate(robots), []);
      for (const [day, expected] of neutral.entries()) {
        const actual = gated[day];
        compared++;
        expect(skippedIds(actual), `${key} day ${day} skipped`).toEqual(skippedIds(expected));
        if (!neutral.slice(0, day + 1).some((run) => run.hostTakenOut)) {
          expect(actual, `${key} day ${day}`).toEqual({ ...expected, hostTakenOut: actual.hostTakenOut });
          continue;
        }
        expect(failedKeys(actual), `${key} day ${day} failed set`).toEqual(
          failedKeys(actual).filter((candidate) => failedKeys(expected).includes(candidate)),
        );
      }
      const cumulative = (runs: RunOutcome[]) => new Set(runs.flatMap((run) => run.devUrls));
      for (const url of cumulative(neutral)) expect(cumulative(gated), `${key} developments`).toContain(url);
    }
    expect(compared).toBe(INDEX_OUTCOMES.length * CANDIDATE_OUTCOMES.length * 2 * 4);
  }, 600_000);

  it('with Crawl-delay 30 and the wait budget spent no due source is skipped and no index fails that the neutral gate fetched', async () => {
    const crawlDelay30 = { status: 200, body: 'User-agent: *\nCrawl-delay: 30\n' };
    const errorIds = (outcome: RunOutcome) =>
      outcome.rows.filter((row) => row.status === 'error').map((row) => row.sourceId);
    for (const [scenario, browser] of scenarios()) {
      const key = JSON.stringify([scenario, browser]);
      const neutral = await runDays(scenario, browser, () => NEUTRAL, []);
      const gated = await runDays(scenario, browser, realGate(crawlDelay30, 0), []);
      for (const [day, expected] of neutral.entries()) {
        const actual = gated[day];
        expect(skippedIds(actual), `${key} day ${day} skipped`).toEqual(skippedIds(expected));
        if (neutral.slice(0, day + 1).some((run) => run.hostTakenOut)) continue;
        expect(errorIds(actual), `${key} day ${day} errors`).toEqual(
          errorIds(actual).filter((id) => errorIds(expected).includes(id)),
        );
        expect(failedKeys(actual), `${key} day ${day} failed set`).toEqual(
          failedKeys(actual).filter((candidate) => failedKeys(expected).includes(candidate)),
        );
      }
    }
  }, 600_000);

  it('never requests a path robots.txt disallows and leaves other hosts untouched', async () => {
    const neutralRequests: Request[] = [];
    const gatedRequests: Request[] = [];
    const scenario: Scenario = { html: 'ok', htmlC: 'ok', rss: 'ok', rssC: 'ok', doc: 'ok' };
    const neutral = await runDays(scenario, true, () => NEUTRAL, neutralRequests);
    const gated = await runDays(scenario, true, realGate({ status: 200, body: DISALLOW_NEWS }), gatedRequests);
    expect(neutralRequests.some((request) => request.url.startsWith('https://www.example.gov.au/news/'))).toBe(true);
    expect(gatedRequests.filter((request) => request.url.startsWith('https://www.example.gov.au/news/'))).toEqual([]);
    for (const [day, run] of gated.entries()) {
      const otherRow = (runs: RunOutcome) => runs.rows.find((row) => row.sourceId === OTHER.id);
      expect(otherRow(run)).toEqual(otherRow(neutral[day]));
    }
    expect(gated[0].rows.find((row) => row.sourceId === HTML.id)).toMatchObject({
      status: 'error',
      failureClass: 'robots_disallowed',
      failedUrl: 'https://www.example.gov.au/news/ai-policy-framework',
    });
  }, 120_000);
});

describe('a spent wait budget never makes a host that asked for nothing worse', () => {
  const HOSTS = 63;
  const SHARED = 75 - HOSTS;
  const manySource = (i: number, host: number, second: boolean): WatchSource => ({
    ...base,
    id: `many-${i}`,
    name: `Many ${i}`,
    url: `https://www.host-${host}.gov.au/rss${second ? '-2' : ''}`,
    kind: 'rss',
    schedule: 'daily',
  });
  const manySources = Array.from({ length: 75 }, (_, i) => manySource(i, i % HOSTS, i >= HOSTS));
  const pairedSources = Array.from({ length: 75 }, (_, i) =>
    i < 2 * SHARED ? manySource(i, Math.floor(i / 2), i % 2 === 1) : manySource(i, i - SHARED, false),
  );
  const allDue = (sources: WatchSource[]) => Object.fromEntries(sources.map((source) => [source.id, true]));

  function manyFetch(requests: string[]): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.toString());
      if (url.pathname.startsWith('/rss')) {
        const item = `https://${url.host}/media/ai-assurance${url.pathname}`;
        return new Response(
          `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Consultation opens on AI assurance guidance at ${url.host}${url.pathname}</title><link>${item}</link><pubDate>Thu, 09 Jul 2026 01:00:00 GMT</pubDate></item></channel></rss>`,
          { status: 200, headers: { 'content-type': 'application/rss+xml' } },
        );
      }
      return new Response(article(`Consultation opens on AI assurance guidance at ${url.host}${url.pathname.replace('/media/ai-assurance', '')}`), { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
  }

  async function runMany(gate: HostGate, sources = manySources) {
    const requests: string[] = [];
    const now = new Date(Date.UTC(2026, 6, 10));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = collect({
      sources,
      catalogSources: sources,
      state: emptyWatchState(),
      existingDevelopments: [],
      fetchImpl: manyFetch(requests),
      now: () => now,
      hostGate: gate,
      logger: () => undefined,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();
    return { result, requests };
  }

  function gateWithCrawlDelay(slow: (origin: string) => boolean, waitBudgetMs?: number) {
    const clock = { t: Date.UTC(2026, 6, 10) };
    return createHostGate({
      hosts: {},
      refused: new Map(),
      fetchRobots: async (origin) => (slow(origin) ? { status: 200, body: 'User-agent: *\nCrawl-delay: 30\n' } : { status: 404, body: '' }),
      now: () => clock.t,
      sleep: async (ms) => {
        clock.t += ms;
      },
      ...(waitBudgetMs === undefined ? {} : { waitBudgetMs }),
    });
  }

  const hostOfUrl = (value: string) => new URL(value).host;

  it("keeps the neutral gate's health with Crawl-delay 30 on all 63 hosts of 75 sources", async () => {
    const neutral = await runMany(NEUTRAL);
    const gated = await runMany(gateWithCrawlDelay(() => true));
    expect(neutral.result.meta.collector.health).toBe('healthy');
    expect(gated.result.meta.collector.health).toBe(neutral.result.meta.collector.health);
    expect(gated.result.meta.collector.sourceResults.filter((row) => row.status === 'error')).toEqual([]);
    expect(Object.values(gated.result.state.seen).filter((entry) => entry.status === 'failed')).toEqual([]);
    expect(new Set(gated.requests.map(hostOfUrl))).toEqual(new Set(neutral.requests.map(hostOfUrl)));
    expect(collectionRunFailed(gated.result.meta.collector.health, gated.result.errors, false)).toBe(false);
  }, 120_000);

  const orderings: Array<[string, WatchSource[]]> = [
    ['spread over the run', manySources],
    ['back to back on each shared host', pairedSources],
  ];

  it.each(orderings)('leaves every host without a Crawl-delay exactly as the neutral gate does after the budget is spent, sources %s', async (_label, sources) => {
    const isSlow = (origin: string) => Number(/host-(\d+)/.exec(origin)?.[1]) % 2 === 0;
    const neutral = await runMany(NEUTRAL, sources);
    const gate = gateWithCrawlDelay(isSlow, 120_000);
    const gated = await runMany(gate, sources);
    expect(gated.result.meta.collector.sourceResults.filter((row) => row.status === 'skipped')).toEqual([]);
    const fastRows = (run: typeof neutral) =>
      run.result.meta.collector.sourceResults
        .filter((row) => !isSlow(sources.find((source) => source.id === row.sourceId)!.url))
        .map((row) => {
          const { durationMs, ...rest } = row;
          void durationMs;
          return rest;
        });
    const fastRequests = (run: typeof neutral) => run.requests.filter((request) => !isSlow(request));
    expect(gated.requests.length).toBeLessThan(neutral.requests.length);
    expect(fastRows(gated)).toEqual(fastRows(neutral));
    expect(fastRequests(gated)).toEqual(fastRequests(neutral));
    expect(gated.result.meta.collector.health).toBe(neutral.result.meta.collector.health);
    const deferred = Object.values(gated.result.state.seen).filter((entry) => entry.status === 'pending');
    expect(deferred.length).toBeGreaterThan(0);
    for (const entry of deferred) expect(entry.attempts).toBe(0);
    expect(Object.values(gated.result.state.seen).filter((entry) => entry.status === 'failed')).toEqual([]);
  }, 120_000);

  it.each([
    ['Crawl-delay 30 on all 63 hosts', manySources, undefined],
    ['Crawl-delay 30 on all 63 hosts with the budget spent and shared hosts back to back', pairedSources, 60_000],
  ] as Array<[string, WatchSource[], number | undefined]>)('the review gate accepts the collector output: %s', async (_label, sources, waitBudgetMs) => {
    const { result } = await runMany(gateWithCrawlDelay(() => true, waitBudgetMs), sources);
    const rows = result.meta.collector.sourceResults;
    expect(rows.filter((row) => row.status === 'skipped')).toEqual([]);
    expect(rows.filter((row) => row.status === 'error')).toEqual([]);
    expect(reviewGateReasons(result.meta, allDue(sources))).toEqual([]);
    const shared = sources[1].id;
    const skipped: CollectionMeta = {
      ...result.meta,
      collector: {
        ...result.meta.collector,
        sourceResults: rows.map((row) =>
          row.sourceId === shared ? { ...row, status: 'skipped', itemCount: null, candidateCount: 0, newCandidateCount: 0 } : row,
        ),
      },
    };
    expect(reviewGateReasons(skipped, allDue(sources))).toContain(`coverage head ${shared}: ${shared}: due source skipped`);
  }, 120_000);
});
