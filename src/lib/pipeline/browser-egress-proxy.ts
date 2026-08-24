import http from 'node:http';
import { isIP } from 'node:net';
import net from 'node:net';
import { Transform, type Duplex } from 'node:stream';
import {
  assertSafeSourceUrl,
  DEFAULT_MAX_RESPONSE_BYTES,
  resolveHostAddresses,
} from './fetch';
import { parseSourceUrl } from '@/lib/source-url';

const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;

export interface BrowserEgressProxy {
  serverUrl: string;
  close(): Promise<void>;
}

export interface BrowserEgressProxyOptions {
  resolveHost?: (hostname: string) => Promise<string[]>;
  connect?: (address: string, port: number) => Promise<Duplex>;
  maxTunnelBytes?: number;
}

function parseConnectAuthority(authority: string | undefined): URL {
  if (!authority) throw new Error('Missing CONNECT authority');
  const target = parseSourceUrl(`https://${authority}`);
  if (
    target.protocol !== 'https:' ||
    (target.port && target.port !== '443') ||
    target.pathname !== '/' ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  ) {
    throw new Error('Invalid CONNECT authority');
  }
  return target;
}

async function connectPinnedAddress(
  address: string,
  port: number,
): Promise<Duplex> {
  return await new Promise((resolve, reject) => {
    const socket = net.connect({
      host: address,
      port,
      family: isIP(address),
    });
    socket.setTimeout(UPSTREAM_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('Timed out connecting to source'));
    });
    socket.once('error', reject);
  });
}

async function connectFirstAvailable(
  addresses: string[],
  port: number,
  connect: (address: string, port: number) => Promise<Duplex>,
): Promise<Duplex> {
  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await connect(address, port);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No validated source address was available');
}

function rejectConnect(socket: Duplex): void {
  socket.end(
    'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
  );
}

export async function createBrowserEgressProxy(
  options: BrowserEgressProxyOptions = {},
): Promise<BrowserEgressProxy> {
  const resolveHost = options.resolveHost ?? resolveHostAddresses;
  const connect = options.connect ?? connectPinnedAddress;
  const maxTunnelBytes =
    options.maxTunnelBytes ?? DEFAULT_MAX_RESPONSE_BYTES + 4 * 1024 * 1024;
  let tunnelBytes = 0;
  const sockets = new Set<Duplex>();
  const server = http.createServer((_request, response) => {
    response.writeHead(403, { Connection: 'close' });
    response.end();
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', (request, clientSocket, head) => {
    void (async () => {
      try {
        const target = parseConnectAuthority(request.url);
        const safeUrl = `https://${target.hostname}/`;
        const addresses = await assertSafeSourceUrl(
          safeUrl,
          resolveHost,
          'public-https',
        );
        const upstream = await connectFirstAvailable(
          addresses,
          443,
          connect,
        );
        sockets.add(upstream);
        upstream.once('close', () => sockets.delete(upstream));
        clientSocket.write(
          'HTTP/1.1 200 Connection Established\r\nProxy-Agent: Policai\r\n\r\n',
        );
        if (head.length > 0) upstream.write(head);
        const trafficLimiter = () => new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            tunnelBytes += chunk.byteLength;
            if (tunnelBytes > maxTunnelBytes) {
              callback(
                new Error(
                  `Browser traffic exceeds ${maxTunnelBytes} byte limit`,
                ),
              );
              return;
            }
            callback(null, chunk);
          },
        });
        const uploadLimiter = trafficLimiter();
        const downloadLimiter = trafficLimiter();
        clientSocket.pipe(uploadLimiter).pipe(upstream);
        upstream.pipe(downloadLimiter).pipe(clientSocket);
        for (const limiter of [uploadLimiter, downloadLimiter]) {
          limiter.once('error', () => {
            upstream.destroy();
            clientSocket.destroy();
          });
        }
        upstream.once('error', () => clientSocket.destroy());
        clientSocket.once('error', () => upstream.destroy());
        upstream.once('close', () => clientSocket.destroy());
        clientSocket.once('close', () => upstream.destroy());
      } catch {
        rejectConnect(clientSocket);
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Browser egress proxy did not bind a TCP port');
  }

  return {
    serverUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
