/* @vitest-environment node */

import { EventEmitter } from 'node:events';
import type https from 'node:https';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { retrieveSourceOverHttp1, SourceFetchError } from './fetch';
import {
  createHostGate,
  DEFAULT_MIN_GAP_MS,
  robotsFetcher,
  type HostGate,
} from './host-gate';

type Reply = { status: number; headers?: Record<string, string>; body?: string } | 'reset';

const ORIGIN = 'https://www.fixture.gov.au';
const NEWS = `${ORIGIN}/news/ai-policy`;
const PRIVATE = `${ORIGIN}/private/secret`;
const ROBOTS = `${ORIGIN}/robots.txt`;
const PAGE = '<main><h1>AI policy</h1><p>Official artificial intelligence guidance.</p></main>';

function stubRequests(routes: Record<string, Reply>) {
  const requested: string[] = [];
  const requestImpl = ((parsed: URL, _options: object, onResponse: (response: PassThrough) => void) => {
    const request = new EventEmitter() as EventEmitter & {
      setTimeout: (ms: number, callback: () => void) => typeof request;
      destroy: (error?: Error) => typeof request;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    request.setTimeout = (ms, callback) => {
      timer = setTimeout(callback, ms);
      return request;
    };
    request.destroy = (error) => {
      if (timer) clearTimeout(timer);
      if (error) queueMicrotask(() => request.emit('error', error));
      return request;
    };
    const url = parsed.toString();
    requested.push(url);
    const reply = routes[url] ?? { status: 404 };
    queueMicrotask(() => {
      if (reply === 'reset') {
        request.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
        return;
      }
      const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
      response.statusCode = reply.status;
      response.headers = reply.headers ?? { 'content-type': 'text/html' };
      onResponse(response);
      response.end(reply.body ?? '');
    });
    return request;
  }) as unknown as typeof https.get;
  return { requestImpl, requested };
}

const NEUTRAL: HostGate = {
  admit: async () => ({ kind: 'go' }),
  observe: () => undefined,
  hosts: () => ({}),
  waited: () => ({}),
};

async function getOverHttp1(
  url: string,
  requestImpl: typeof https.get,
  gate: HostGate,
) {
  return retrieveSourceOverHttp1(url, {
    now: () => new Date('2026-10-20T19:30:00.000Z'),
    timeoutMs: 1_000,
    resolveHost: async () => ['93.184.216.34'],
    requestImpl,
    gate,
  });
}

describe('HostGate through production plain HTTP (retrieveSourceOverHttp1)', () => {
  it('never requests a robots Disallow and matches a neutral gate on allowed paths', async () => {
    const routes: Record<string, Reply> = {
      [ROBOTS]: {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow: /private\n',
      },
      [NEWS]: { status: 200, headers: { 'content-type': 'text/html' }, body: PAGE },
      [PRIVATE]: { status: 200, headers: { 'content-type': 'text/html' }, body: PAGE },
    };
    const neutral = stubRequests(routes);
    const gated = stubRequests(routes);
    const gate = createHostGate({
      hosts: {},
      refused: new Map(),
      fetchRobots: robotsFetcher({
        requestImpl: gated.requestImpl,
        resolveHost: async () => ['93.184.216.34'],
        timeoutMs: 50,
      }),
      now: Date.now,
      sleep: async () => undefined,
      minGapMs: 0,
    });

    const neutralNews = await getOverHttp1(NEWS, neutral.requestImpl, NEUTRAL);
    const gatedNews = await getOverHttp1(NEWS, gated.requestImpl, gate);
    expect(gatedNews.evidence.contentHash).toBe(neutralNews.evidence.contentHash);
    expect(gated.requested.filter((url) => url === NEWS)).toEqual([NEWS]);
    expect(neutral.requested.filter((url) => url === NEWS)).toEqual([NEWS]);

    await expect(getOverHttp1(PRIVATE, gated.requestImpl, gate)).rejects.toMatchObject({
      code: 'gate_refused',
      url: PRIVATE,
    });
    expect(gated.requested.filter((url) => url === PRIVATE)).toEqual([]);
    const neutralPrivate = await getOverHttp1(PRIVATE, neutral.requestImpl, NEUTRAL);
    expect(neutralPrivate.evidence.finalUrl).toContain('/private/');
    expect(neutral.requested.filter((url) => url === PRIVATE)).toEqual([PRIVATE]);
  });

  it('after a bare 429 on plain HTTP, later requests to that host are refused and the other host still matches the neutral gate', async () => {
    const other = 'https://www.other.gov.au/item';
    const routes: Record<string, Reply> = {
      [ROBOTS]: { status: 404, body: '' },
      [`https://www.other.gov.au/robots.txt`]: { status: 404, body: '' },
      [NEWS]: { status: 429, headers: { 'content-type': 'text/plain' }, body: 'slow' },
      [other]: { status: 200, headers: { 'content-type': 'text/html' }, body: PAGE },
    };
    const neutral = stubRequests(routes);
    const gated = stubRequests(routes);
    let clock = Date.parse('2026-10-20T19:30:00.000Z');
    const gate = createHostGate({
      hosts: {},
      refused: new Map(),
      fetchRobots: robotsFetcher({
        requestImpl: gated.requestImpl,
        resolveHost: async () => ['93.184.216.34'],
        timeoutMs: 50,
      }),
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      minGapMs: DEFAULT_MIN_GAP_MS,
    });

    await expect(getOverHttp1(NEWS, gated.requestImpl, gate)).rejects.toBeInstanceOf(SourceFetchError);
    await expect(getOverHttp1(NEWS, gated.requestImpl, gate)).rejects.toMatchObject({
      code: 'gate_refused',
      message: expect.stringMatching(/backing off|not requested/),
    });
    expect(gated.requested.filter((url) => url === NEWS)).toEqual([NEWS]);

    const neutralOther = await getOverHttp1(other, neutral.requestImpl, NEUTRAL);
    const gatedOther = await getOverHttp1(other, gated.requestImpl, gate);
    expect(gatedOther.evidence.contentHash).toBe(neutralOther.evidence.contentHash);
    expect(gated.requested.filter((url) => url === other)).toEqual([other]);
  });
});
