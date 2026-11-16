import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lookup } from 'node:dns';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPublicDestination,
  assertPublicScrape,
  isBlockedAddress,
  publicFetch,
  readCapped,
} from '../src/lib/public-fetch.js';
import { writeForever } from './support/endless-response.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => current.close((err) => (err ? reject(err) : resolve())));
});

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
  server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return address.port;
}

// 127.0.0.1 stands in for a public host; 127.0.0.2 for a private one.
const isBlocked = (address: string) => address !== '127.0.0.1';
const resolvesTo = (address: string): typeof lookup =>
  ((_host: string, _options: unknown, callback: (e: null, a: { address: string; family: number }[]) => void) =>
    callback(null, [{ address, family: 4 }])) as unknown as typeof lookup;

describe('isBlockedAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0'])(
    'blocks %s',
    (address) => expect(isBlockedAddress(address)).toBe(true),
  );
  it.each(['1.1.1.1', '203.2.218.214', '2606:4700::1111'])('allows %s', (address) =>
    expect(isBlockedAddress(address)).toBe(false),
  );
});

describe('publicFetch', () => {
  it('reads a public page and reports its final URL after a redirect', async () => {
    const port = await listen((req, res) => {
      if (req.url === '/old') {
        res.writeHead(301, { location: '/new' }).end();
        return;
      }
      res.setHeader('content-type', 'text/html');
      res.end('<title>Here</title>');
    });
    const res = await publicFetch(`http://127.0.0.1:${port}/old`, {}, { isBlocked });
    expect(res.status).toBe(200);
    expect(res.url).toBe(`http://127.0.0.1:${port}/new`);
    expect(await res.text()).toBe('<title>Here</title>');
  });

  it('refuses a private address literal', async () => {
    await expect(publicFetch('http://10.0.0.1/')).rejects.toThrow(/non-public address/);
    await expect(publicFetch('http://[::1]/')).rejects.toThrow(/non-public address/);
  });

  it('refuses a redirect to a private address', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.2:${port}/admin` }).end();
    });
    await expect(publicFetch(`http://127.0.0.1:${port}/`, {}, { isBlocked })).rejects.toThrow(/non-public address/);
  });

  it('refuses a name that resolves to a private address when it connects', async () => {
    const seen: string[] = [];
    const port = await listen((req, res) => {
      seen.push(String(req.url));
      res.end('reached');
    });
    await expect(
      publicFetch(`http://feed.example:${port}/`, {}, { isBlocked, lookup: resolvesTo('127.0.0.2') }),
    ).rejects.toThrow(/does not resolve to a public address/);
    expect(seen).toEqual([]);
  });

  it('refuses other schemes and credentials', async () => {
    await expect(publicFetch('file:///etc/passwd')).rejects.toThrow(/Refusing file:/);
    await expect(publicFetch('https://user:pw@example.org/')).rejects.toThrow(/credentials/);
  });
});

describe('assertPublicDestination', () => {
  it('passes a name with only public addresses', async () => {
    await expect(
      assertPublicDestination('https://example.org/x', { resolve: async () => [{ address: '93.184.215.14', family: 4 }] }),
    ).resolves.toBeUndefined();
  });

  it('refuses a name with any private address', async () => {
    await expect(
      assertPublicDestination('https://example.org/x', {
        resolve: async () => [
          { address: '93.184.215.14', family: 4 },
          { address: '192.168.0.10', family: 4 },
        ],
      }),
    ).rejects.toThrow(/does not resolve to a public address/);
  });
});

describe('readCapped', () => {
  const get = (port: number) => publicFetch(`http://127.0.0.1:${port}/`, {}, { isBlocked });

  it('returns a body of exactly the cap', async () => {
    const port = await listen((_req, res) => res.end('a'.repeat(1024)));
    expect((await readCapped(await get(port), 1024)).toString()).toBe('a'.repeat(1024));
  });

  it('rejects a body one byte over the cap', async () => {
    const port = await listen((_req, res) => res.end('a'.repeat(1025)));
    await expect(readCapped(await get(port), 1024)).rejects.toThrow(/exceeds 1024 bytes/);
  });

  it('rejects a body that never ends and closes the connection', async () => {
    let closed: Promise<void> | undefined;
    const port = await listen((_req, res) => {
      closed = writeForever(res);
    });
    await expect(readCapped(await get(port), 256 * 1024)).rejects.toThrow(/exceeds 262144 bytes/);
    await closed;
  });

  it('truncates at the cap and closes the connection when asked to', async () => {
    let closed: Promise<void> | undefined;
    const port = await listen((_req, res) => {
      closed = writeForever(res);
    });
    expect(await readCapped(await get(port), 100_000, { overflow: 'truncate' })).toHaveLength(100_000);
    await closed;
  });

  it('stops reading once the caller has what it needs', async () => {
    let closed: Promise<void> | undefined;
    const port = await listen((_req, res) => {
      res.write('<h1>Headline</h1>');
      closed = writeForever(res);
    });
    const body = await readCapped(await get(port), 64 * 1024 * 1024, {
      overflow: 'truncate',
      stopAfter: (chunk) => Buffer.from(chunk).includes('</h1>'),
    });
    expect(body.toString()).toContain('<h1>Headline</h1>');
    expect(body.byteLength).toBeLessThan(1024 * 1024);
    await closed;
  });
});

describe('assertPublicScrape', () => {
  it('accepts a scrape that started and landed on public addresses', async () => {
    await expect(
      assertPublicScrape({ sourceURL: 'https://1.1.1.1/a', url: 'https://1.0.0.1/b' }),
    ).resolves.toBeUndefined();
  });

  it('refuses a scrape that landed on a private address', async () => {
    await expect(
      assertPublicScrape({ sourceURL: 'https://1.1.1.1/a', url: 'http://169.254.169.254/latest/meta-data' }),
    ).rejects.toThrow(/non-public address/);
  });

  it('refuses a scrape whose final host resolves to a private address', async () => {
    await expect(
      assertPublicScrape(
        { sourceURL: 'https://1.1.1.1/a', url: 'https://internal.example/' },
        { resolve: async () => [{ address: '10.0.0.5', family: 4 }] },
      ),
    ).rejects.toThrow(/does not resolve to a public address/);
  });

  it('refuses a scrape that does not say where it landed', async () => {
    await expect(assertPublicScrape({ sourceURL: 'https://1.1.1.1/a' })).rejects.toThrow(/no final URL/);
    await expect(assertPublicScrape(undefined)).rejects.toThrow(/no final URL/);
  });
});
