/* @vitest-environment node */

import net from 'node:net';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createBrowserEgressProxy } from './browser-egress-proxy';

async function connectResponse(
  proxyUrl: string,
  authority: string,
): Promise<string> {
  const proxy = new URL(proxyUrl);
  return await new Promise((resolve, reject) => {
    const socket = net.connect({
      host: proxy.hostname,
      port: Number(proxy.port),
    });
    let response = '';
    socket.setTimeout(2_000);
    socket.once('connect', () => {
      socket.write(
        `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`,
      );
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\r\n\r\n')) {
        socket.destroy();
        resolve(response);
      }
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('proxy test timed out'));
    });
    socket.once('error', reject);
  });
}

async function connectUntilClosed(
  proxyUrl: string,
  authority: string,
): Promise<string> {
  const proxy = new URL(proxyUrl);
  return await new Promise((resolve, reject) => {
    const socket = net.connect({
      host: proxy.hostname,
      port: Number(proxy.port),
    });
    let response = '';
    socket.setTimeout(2_000);
    socket.once('connect', () => {
      socket.write(
        `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`,
      );
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });
    socket.once('close', () => resolve(response));
    socket.once('timeout', () => {
      socket.destroy(new Error('proxy test timed out'));
    });
    socket.once('error', reject);
  });
}

describe('createBrowserEgressProxy', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])('rejects CONNECT when DNS resolves to blocked address %s', async (address) => {
    const connect = vi.fn(async () => new PassThrough());
    const proxy = await createBrowserEgressProxy({
      resolveHost: async () => [address],
      connect,
    });
    try {
      const response = await connectResponse(
        proxy.serverUrl,
        'source.example.gov.au:443',
      );

      expect(response).toMatch(/^HTTP\/1\.1 403 /);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await proxy.close();
    }
  });

  it('pins the tunnel to a validated public address', async () => {
    const connect = vi.fn(async () => new PassThrough());
    const proxy = await createBrowserEgressProxy({
      resolveHost: async () => ['93.184.216.34'],
      connect,
    });
    try {
      const response = await connectResponse(
        proxy.serverUrl,
        'source.example.gov.au:443',
      );

      expect(response).toMatch(/^HTTP\/1\.1 200 /);
      expect(connect).toHaveBeenCalledWith('93.184.216.34', 443);
    } finally {
      await proxy.close();
    }
  });

  it('rejects plaintext and non-standard-port proxy requests', async () => {
    const connect = vi.fn(async () => new PassThrough());
    const proxy = await createBrowserEgressProxy({
      resolveHost: async () => ['93.184.216.34'],
      connect,
    });
    try {
      const response = await connectResponse(
        proxy.serverUrl,
        'source.example.gov.au:8443',
      );

      expect(response).toMatch(/^HTTP\/1\.1 403 /);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await proxy.close();
    }
  });

  it('closes the tunnel before forwarding bytes over the aggregate budget', async () => {
    const upstream = new PassThrough();
    const connect = vi.fn(async () => upstream);
    const proxy = await createBrowserEgressProxy({
      resolveHost: async () => ['93.184.216.34'],
      connect,
      maxTunnelBytes: 4,
    });
    try {
      const pending = connectUntilClosed(
        proxy.serverUrl,
        'source.example.gov.au:443',
      );
      await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
      upstream.write(Buffer.from('12345'));
      const response = await pending;

      expect(response).toMatch(/^HTTP\/1\.1 200 /);
      expect(response.split('\r\n\r\n')[1]).toBe('');
    } finally {
      await proxy.close();
    }
  });
});
