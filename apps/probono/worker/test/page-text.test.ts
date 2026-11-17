import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicFetchInit } from '../src/lib/public-fetch.js';
import { writeForever } from './support/endless-response.js';

vi.mock('../src/lib/public-fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/public-fetch.js')>();
  return {
    ...actual,
    publicFetch: (url: string, init: PublicFetchInit) =>
      actual.publicFetch(url, init, { isBlocked: () => false }),
  };
});
import { fetchDirect, fetchViaFirecrawl } from '../src/lib/page-text.js';

let server: Server | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (!server) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => current.close((err) => (err ? reject(err) : resolve())));
});

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

const PARAGRAPH = '<p>Applications for the community legal grants round close on 30 November 2026.</p>';
const PAGE = `<html><body>${PARAGRAPH.repeat(10)}`;

describe('fetchDirect', () => {
  it('returns the text of a page that fits the cap', async () => {
    const base = await listen((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(PAGE);
    });
    expect(await fetchDirect(`${base}/grants`)).toContain('close on 30 November 2026');
  });

  it('returns no page, not a truncated one, when the response never ends', async () => {
    let closed: Promise<void> | undefined;
    const base = await listen((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.write(PAGE);
      closed = writeForever(res);
    });
    expect(await fetchDirect(`${base}/grants`)).toBeNull();
    await closed;
  });
});

describe('fetchViaFirecrawl', () => {
  const MARKDOWN = 'Applications for the community legal grants round close on 30 November 2026. '.repeat(10);
  const scrape = (metadata: unknown) =>
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ data: { markdown: MARKDOWN, metadata } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

  it('returns the scraped text when the scrape landed on a public address', async () => {
    scrape({ sourceURL: 'https://1.1.1.1/grants', url: 'https://1.0.0.1/grants-2026' });
    expect(await fetchViaFirecrawl('https://1.1.1.1/grants')).toContain('close on 30 November 2026');
  });

  it('returns no page when the scrape landed on a private address', async () => {
    scrape({ sourceURL: 'https://1.1.1.1/grants', url: 'http://169.254.169.254/latest/meta-data' });
    expect(await fetchViaFirecrawl('https://1.1.1.1/grants')).toBeNull();
  });

  it('returns no page when the scrape does not say where it landed', async () => {
    scrape(undefined);
    expect(await fetchViaFirecrawl('https://1.1.1.1/grants')).toBeNull();
  });
});
