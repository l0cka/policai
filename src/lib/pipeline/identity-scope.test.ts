/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveSource } from './fetch';
import { requestedCollectorIdentity, type CollectorRequestInit } from './identity';
import { WATCH_SOURCES } from './sources';
import { validateWatchSources } from '../validate-data';
import { destinationCollectorIdentity, identityAuthorityFor } from './identity';
const { scrapeWithFirecrawl } = vi.hoisted(() => ({ scrapeWithFirecrawl: vi.fn() }));
vi.mock('./firecrawl', () => ({ scrapeWithFirecrawl }));
vi.mock('./claude-classify', () => ({ classifyBatch: vi.fn(), CLAUDE_BATCH_SIZE: 20 }));
import { collect, emptyWatchState } from './collect';

const source = WATCH_SOURCES.find(s => s.id === 'industry-ai-publications')!;
const authority = { sourceId: source.id, sourceUrl: source.url, until: '2026-10-21' };
const other = 'https://www.oaic.gov.au/ai-policy';
const html = '<html><body><main><h1>AI policy</h1><p>Government artificial intelligence policy guidance.</p></main></body></html>';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
  vi.stubEnv('USE_CLAUDE_CLASSIFIER', '');
  scrapeWithFirecrawl.mockReset();
  scrapeWithFirecrawl.mockResolvedValue({ ok: false, reason: 'unavailable', detail: 'offline fixture' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('destination authority before outgoing requests', () => {
  it('expires all 16 permissions at the exact Sydney boundary with warnings only', () => {
    const before = new Date('2026-10-20T12:59:59.999Z');
    const boundary = new Date('2026-10-20T13:00:00.000Z');
    const active = (now: Date) => WATCH_SOURCES.filter(s =>
      destinationCollectorIdentity(identityAuthorityFor(s), s.url, now) === 'exempt');
    expect(active(before)).toHaveLength(16);
    expect(active(boundary)).toHaveLength(0);
    const report = validateWatchSources(WATCH_SOURCES, boundary);
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter(w => w.includes('identity exception expired'))).toHaveLength(16);
  });

  it('does not extend authority to sibling origins, credentials or invalid clocks', () => {
    for (const destination of ['https://industry.gov.au/policy', 'https://other.industry.gov.au/policy',
      'https://www.industry.gov.au:444/policy', 'https://user@www.industry.gov.au/policy',
      'http://www.industry.gov.au/policy', 'malformed', 'https://www.dta.gov.au/policy']) {
      expect(destinationCollectorIdentity(authority, destination)).toBe('declared');
    }
    expect(destinationCollectorIdentity(authority, source.url, new Date('invalid'))).toBe('declared');
    for (const until of [undefined, null, 20261021, {}, '', '2026-02-30', '2026-13-01', '2026-10-21T23:59:00Z']) {
      expect(destinationCollectorIdentity({ ...authority, until } as never, source.url)).toBe('declared');
    }
  });

  for (const linked of [false, true]) {
    it(`scopes ${linked ? 'linked documents' : 'redirects'} to the authorised origin`, async () => {
      const target = 'https://www.oaic.gov.au/policy.pdf';
      const calls: Array<[string, unknown]> = [];
      const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push([url, (init as CollectorRequestInit).collectorIdentity]);
        if (url === target) return new Response('%PDF-1.4\nstable fixture', { headers: { 'content-type': 'application/pdf' } });
        return linked
          ? new Response(`<main><a href="${target}">AI policy document</a></main>`, { headers: { 'content-type': 'text/html' } })
          : new Response(null, { status: 302, headers: { location: target } });
      }) as typeof fetch;
      const result = await retrieveSource(source.url, { identityAuthority: authority, fetchImpl, attempts: 1 });
      if (linked) expect(result.evidence.linkedDocuments?.[0]?.url).toBe(target);
      expect(calls).toEqual([[source.url, 'exempt'], [target, 'declared']]);
    });
  }

  it('does not trust a transferable exempt flag or malformed authority', () => {
    for (const bad of [undefined, {}, { ...authority, sourceId: 'unknown' }, { ...authority, sourceUrl: other }, { ...authority, until: '2027-01-01' }]) {
      expect(requestedCollectorIdentity({ collectorIdentity: 'exempt', identityAuthority: bad } as RequestInit, source.url)).toBe('declared');
    }
  });

  it('rechecks expiry on each redirect, not only at run start', async () => {
    vi.setSystemTime(new Date('2026-10-20T12:59:59.999Z'));
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push((init as CollectorRequestInit).collectorIdentity);
      if (calls.length === 1) {
        vi.setSystemTime(new Date('2026-10-20T13:00:00.000Z'));
        return new Response(null, { status: 302, headers: { location: `${source.url}/policy` } });
      }
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
    await retrieveSource(source.url, { identityAuthority: authority, fetchImpl, attempts: 1 });
    expect(calls).toEqual(['exempt', 'declared']);
  });

  for (const candidate of [other, 'https://www.industry.gov.au/ai-policy']) {
    it(`bypasses Firecrawl for exception-source candidate ${candidate}`, async () => {
      const calls: Array<[string, unknown]> = [];
      const browserFetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push([url, (init as CollectorRequestInit).collectorIdentity]);
        return new Response(url === source.url
          ? `<main><ul class="news-list"><li><a href="${candidate}">New AI policy framework released</a></li></ul></main>` : html,
        { headers: { 'content-type': 'text/html' } });
      }) as typeof fetch;
      const result = await collect({ sources: [source], state: emptyWatchState(), existingDevelopments: [], browserFetchImpl,
        fetchImpl: vi.fn(async () => { throw new Error('unexpected HTTP'); }) as typeof fetch,
        now: () => new Date() });
      expect(result.errors).toEqual([]);
      expect(scrapeWithFirecrawl).not.toHaveBeenCalled();
      expect(calls).toEqual([[source.url, 'exempt'], [candidate, candidate === other ? 'declared' : 'exempt']]);
    });
  }

  it('does not contaminate the following non-exempt source', async () => {
    const second = { ...source, id: 'second', url: other, kind: 'document' as const, identityException: undefined };
    const calls: Array<[string, unknown]> = [];
    const browserFetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), (init as CollectorRequestInit).collectorIdentity]);
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
    await collect({ sources: [{ ...source, kind: 'document' }, second], state: emptyWatchState(), existingDevelopments: [], browserFetchImpl, now: () => new Date() });
    expect(calls).toEqual([[source.url, 'exempt'], [other, 'declared']]);
  });
});
