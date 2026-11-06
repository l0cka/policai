import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lookup } from 'node:dns';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { assertPublicDestination, isBlockedAddress, publicFetch } from '../src/lib/public-fetch.js';

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
