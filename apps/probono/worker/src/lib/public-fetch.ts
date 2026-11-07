import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { lookup as dnsLookupAll } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

/*
 * Outbound GETs to URLs that came from a feed or a listing page. Those URLs are
 * untrusted, and the worker runs on a host whose private services must not be
 * reachable through it, so every hop is checked: http(s) only, no credentials,
 * and every address the name resolves to must be public. The check runs in the
 * socket's own DNS lookup, so a name cannot pass the check and then connect
 * somewhere else. The ranges match the root collector's (src/lib/pipeline/fetch.ts).
 */

const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:db8::', 32],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}
const GLOBAL_IPV6_UNICAST = new BlockList();
GLOBAL_IPV6_UNICAST.addSubnet('2000::', 3, 'ipv6');

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : null;
  if (mapped && isIP(mapped) === 4) return BLOCKED.check(mapped, 'ipv4');
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) {
    return !GLOBAL_IPV6_UNICAST.check(address, 'ipv6') || BLOCKED.check(address, 'ipv6');
  }
  return true;
}

export class UnsafeDestinationError extends Error {}

type Policy = { isBlocked: (address: string) => boolean };
const DEFAULT_POLICY: Policy = { isBlocked: isBlockedAddress };

function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

function assertPublicUrl(raw: string | URL, policy: Policy): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeDestinationError(`Refusing ${url.protocol} URL`);
  }
  if (url.username || url.password) {
    throw new UnsafeDestinationError('Refusing a URL with credentials');
  }
  const host = bareHost(url);
  if (isIP(host) && policy.isBlocked(host)) {
    throw new UnsafeDestinationError(`Refusing non-public address ${host}`);
  }
  return url;
}

/**
 * Throws unless the URL is http(s) and its host resolves only to public
 * addresses. For URLs handed to another service (Firecrawl) that does its own
 * fetching; direct fetches use `publicFetch`, which checks at connect time.
 */
export async function assertPublicDestination(
  raw: string,
  { resolve = (host: string) => dnsLookupAll(host, { all: true, verbatim: true }), ...policy }: Partial<Policy> & {
    resolve?: (host: string) => Promise<LookupAddress[]>;
  } = {},
): Promise<void> {
  const effective = { ...DEFAULT_POLICY, ...policy };
  const url = assertPublicUrl(raw, effective);
  const host = bareHost(url);
  if (isIP(host)) return;
  const addresses = await resolve(host);
  if (addresses.length === 0 || addresses.some((a) => effective.isBlocked(a.address))) {
    throw new UnsafeDestinationError(`${host} does not resolve to a public address`);
  }
}

function guardedLookup(policy: Policy, resolver: typeof dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) return callback(error, '', 0);
      const blocked = addresses.length === 0 || addresses.some((a) => policy.isBlocked(a.address));
      if (blocked) {
        return callback(
          new UnsafeDestinationError(`${hostname} does not resolve to a public address`),
          '',
          0,
        );
      }
      if (options.all) return (callback as (e: null, a: LookupAddress[]) => void)(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

const MAX_REDIRECTS = 5;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export type PublicFetchInit = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** `manual` returns a 3xx as is, for callers that follow redirects themselves. */
  redirect?: 'follow' | 'manual';
};

export type PublicFetchOptions = Partial<Policy> & { lookup?: typeof dnsLookup };

function getOnce(url: URL, init: PublicFetchInit, lookup: LookupFunction): Promise<Response> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      { method: 'GET', headers: init.headers, signal: init.signal, lookup },
      (res) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
          else if (value !== undefined) headers.set(name, value);
        }
        const status = res.statusCode ?? 502;
        const bodyless = status === 204 || status === 304;
        if (bodyless) res.resume();
        const response = new Response(
          bodyless ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>),
          { status, statusText: res.statusMessage, headers },
        );
        Object.defineProperty(response, 'url', { value: url.href });
        resolve(response);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * A GET that only reaches public addresses, on every redirect hop. The
 * returned Response's `url` is the final URL.
 */
export async function publicFetch(
  raw: string | URL,
  init: PublicFetchInit = {},
  { lookup = dnsLookup, ...policy }: PublicFetchOptions = {},
): Promise<Response> {
  const effective = { ...DEFAULT_POLICY, ...policy };
  const connectLookup = guardedLookup(effective, lookup);
  let url = assertPublicUrl(raw, effective);
  for (let hop = 0; ; hop++) {
    const response = await getOnce(url, init, connectLookup);
    const location = response.headers.get('location');
    if (init.redirect === 'manual' || !REDIRECTS.has(response.status) || !location) return response;
    await response.body?.cancel();
    if (hop === MAX_REDIRECTS) throw new Error(`Too many redirects at ${raw}`);
    url = assertPublicUrl(new URL(location, url), effective);
  }
}
