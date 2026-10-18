import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { FEED_USER_AGENT, fetchRss } from '../src/lib/fetch-rss.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Tenants</title>
<item><title>Hotter summers, hotter homes</title><link>https://www.tenants.org.au/blog/hotter-summers</link><pubDate>Thu, 08 Oct 2026 07:12:25 +0000</pubDate><description>Heat in rentals.</description></item>
</channel></rss>`;

let server: Server | undefined;

afterEach(async () => {
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

describe('fetchRss', () => {
  it('reads a 200 feed with the collector identity and returns its items', async () => {
    const seen: string[] = [];
    const base = await listen((req, res) => {
      seen.push(String(req.headers['user-agent']));
      res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
      res.end(RSS);
    });

    const items = await fetchRss(`${base}/rss.xml`);

    expect(seen).toEqual([FEED_USER_AGENT]);
    expect(FEED_USER_AGENT).toBe('Policai/1.0 (+https://policai.org)');
    expect(items).toMatchObject([
      { title: 'Hotter summers, hotter homes', url: 'https://www.tenants.org.au/blog/hotter-summers' },
    ]);
  });

  it('names the URL when the ingest host receives 403', async () => {
    const base = await listen((_req, res) => {
      res.statusCode = 403;
      res.end('denied');
    });

    await expect(fetchRss(`${base}/rss.xml`)).rejects.toThrow(
      `Ingest host received status 403 at ${base}/rss.xml`,
    );
  });

  it('follows an http redirect to the feed', async () => {
    const base = await listen((req, res) => {
      if (req.url === '/go') {
        res.statusCode = 302;
        res.setHeader('location', '/rss.xml');
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/rss+xml');
      res.end(RSS);
    });

    const items = await fetchRss(`${base}/go`);
    expect(items).toHaveLength(1);
  });

  it('does not follow a non-http redirect', async () => {
    const base = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', 'javascript:alert(1)');
      res.end();
    });

    await expect(fetchRss(`${base}/rss.xml`)).rejects.toThrow(/Refusing redirect/);
  });
});
