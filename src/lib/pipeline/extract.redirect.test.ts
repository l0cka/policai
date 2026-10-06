/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { canonicalizeSourceUrl } from '@/lib/source-url';
import { collect, emptyWatchState } from './collect';
import { retrieveSource } from './fetch';
import { WATCH_SOURCES } from './sources';
import { extractCandidatesFromHtml, extractCandidatesFromRss } from './extract';

afterEach(() => vi.unstubAllEnvs());

const TITLE = 'New resources on transparency for use of AI and automated decision-making';
const TARGET = 'https://www.oaic.gov.au/news/media-centre/new-resources-on-transparency-for-use-of-ai-and-automated-decision-making';
const BASE = 'https://www.oaic.gov.au/news/media-centre';
const wrapper = (target: string, host = 'www.oaic.gov.au') =>
  `https://${host}/s/redirect?auth=fixture&collection=media&url=${encodeURIComponent(target)}`;
// Synthetic markup using the existing inline-listing fixture convention.
const listing = (...urls: string[]) => `<main><ul class="search-results">${urls.map((url) =>
  `<li><h2><a href="${url.replaceAll('&', '&amp;')}">${TITLE}</a></h2><time datetime="2026-09-30">30 September 2026</time></li>`,
).join('')}</ul></main>`;

describe('official search redirect extraction', () => {
  it.each([
    'https://external.example/ai-policy',
    'https://oaic.gov.au.external.example/ai-policy',
    'http://www.oaic.gov.au/ai-policy',
    'https://user:pass@www.oaic.gov.au/ai-policy',
    'https://www.oaic.gov.au:8443/ai-policy',
    'https://www.oaic.gov.au/ai-policy%ZZ',
    'https://www.oaic.gov.au/ai-policy%E0%A4',
    'https://www.oaic.gov.au/ai-policy\n',
    'https://www.oaic.gov.au/ai-policy\u0000',
    'https://www.oaic.gov.au/ai-policy\u001f',
    'https:////www.oaic.gov.au/ai-policy',
    '//www.oaic.gov.au/ai-policy',
    'not a URL',
    encodeURIComponent(TARGET),
  ])('leaves an unsafe or malformed target wrapped: %s', (target) => {
    const url = wrapper(target);
    expect(extractCandidatesFromHtml(listing(url), BASE)[0].url)
      .toBe(canonicalizeSourceUrl(url));
  });

  it.each([
    wrapper(TARGET).replace('/s/redirect?', '/s/redirect/?'),
    wrapper(TARGET).replace('/s/redirect?', '/other?'),
    wrapper(TARGET).replace(/&url=.*/, ''),
    `${wrapper(TARGET)}&url=${encodeURIComponent(TARGET)}`,
    'https://www.oaic.gov.au/s/redirect?url=https%3A%2F%2Fwww.oaic.gov.au%2Fai%ZZ',
  ])('does not interpret ambiguous queries or other paths: %s', (url) => {
    expect(extractCandidatesFromHtml(listing(url), BASE)[0].url)
      .toBe(canonicalizeSourceUrl(url));
  });

  it.each(['external.example', 'oaic.gov.au.external.example'])('does not launder a target through an untrusted wrapper: %s', (host) => {
    expect(extractCandidatesFromHtml(listing(wrapper(TARGET, host)), BASE)).toEqual([]);
  });

  it.each([
    ['www.industry.gov.au', 'https://consult.industry.gov.au/ai-policy'],
    ['www.industry.gov.au', 'https://www.csiro.au/ai-policy'],
    ['www.csiro.au', 'https://www.csiro.au/ai-policy'],
    ['www.industry.gov.au', TARGET],
  ])('applies the central allow-list to non-OAIC wrappers: %s → %s', (host, target) => {
    expect(extractCandidatesFromHtml(listing(wrapper(target, host)), BASE)[0].url).toBe(target);
  });

  it('also unwraps RSS links through the shared extraction path', () => {
    const xml = `<rss><channel><item><title>${TITLE}</title><link>${wrapper(TARGET).replaceAll('&', '&amp;')}</link></item></channel></rss>`;
    expect(extractCandidatesFromRss(xml, BASE)[0].url).toBe(TARGET);
  });

  it.each(['https://external.example/ai-policy', 'http://www.oaic.gov.au/ai-policy'])('still rejects an unsafe redirect during retrieval: %s', async (target) => {
    const candidate = extractCandidatesFromHtml(listing(wrapper(target)), BASE)[0];
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: target },
    }));
    await expect(retrieveSource(candidate.url, { fetchImpl })).rejects.toMatchObject({
      code: 'destination_mismatch', retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetches the canonical candidate despite a terminal failed wrapper seen entry', async () => {
    vi.stubEnv('USE_CLAUDE_CLASSIFIER', '');
    const source = WATCH_SOURCES.find((entry) => entry.id === 'oaic-media')!;
    const wrappedUrl = canonicalizeSourceUrl(wrapper(TARGET));
    const state = emptyWatchState();
    const failed = {
      firstSeenAt: '2026-10-02T00:00:00.000Z', sourceId: source.id,
      status: 'failed' as const, attempts: 1,
      lastError: 'Source URL must be HTTPS on an allow-listed official host',
      candidate: { url: wrappedUrl, title: TITLE, text: TITLE },
    };
    state.seen[wrappedUrl] = failed;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === BASE) return new Response(listing(wrapper(TARGET)));
      if (url === TARGET) return new Response(`<main><h1>${TITLE}</h1><p>OAIC guidance on artificial intelligence, privacy and automated decision-making.</p></main>`);
      throw new Error(`Unexpected fixture fetch: ${url}`);
    });
    const result = await collect({
      sources: [source], state, existingDevelopments: [], fetchImpl,
      browserFetchImpl: fetchImpl,
      now: () => new Date('2026-10-06T00:00:00.000Z'),
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([BASE, TARGET]);
    expect(result.errors).toEqual([]);
    expect(result.state.seen[wrappedUrl]).toEqual(failed);
    expect(result.state.seen[TARGET]).toMatchObject({ attempts: 1, candidate: { url: TARGET } });
    expect(result.state.seen[TARGET].status).not.toBe('failed');
    expect(result.developments.map(({ url }) => url)).toContain(TARGET);
  });

  it('stores the canonical OAIC target and deduplicates wrapper variants and direct links', () => {
    const candidates = extractCandidatesFromHtml(listing(
      wrapper(`${TARGET}/?utm_source=search#top`),
      wrapper(TARGET).replace('auth=fixture', 'auth=changed'),
      TARGET,
    ), BASE);
    expect(candidates).toEqual([expect.objectContaining({
      url: TARGET, title: TITLE, dateHint: '2026-09-30',
    })]);
  });
});
