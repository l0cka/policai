import type { FailureClass } from './failure';
import { readResponseBytes, retrieveSourceOverHttp1, SourceFetchError } from './fetch';
import { COLLECTOR_IDENTITY_TOKEN, COLLECTOR_USER_AGENT } from './identity';
import { parseRobots, ROBOTS_MAX_BYTES, robotsAllows, type RobotsRules } from './robots';

export type Host = string & { readonly __brand: 'Host' };

export const DEFAULT_MIN_GAP_MS = 2000;
export const MAX_WAIT_MS = 30_000;
export const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
export const BACKOFF_BASE_MS = 60 * 60 * 1000;
export const BACKOFF_CAP_MS = 24 * 60 * 60 * 1000;
export const HOST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ROBOTS_RULES_CAP = 500;
export const ROBOTS_PATTERN_CAP = 1000;
export const ROBOTS_SITEMAPS_CAP = 20;
export const ROBOTS_TIMEOUT_MS = 20_000;
export const HOST_KEY = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

const PRODUCT_TOKEN = COLLECTOR_IDENTITY_TOKEN.split('/')[0];

export interface RobotsRecord extends RobotsRules {
  fetchedAt: string;
  status: 'parsed' | 'absent' | 'unreachable';
}

export interface HostRecord {
  seenAt: string;
  robots: RobotsRecord | null;
  backoffUntil: string | null;
  backoffStatus: 429 | 503 | null;
  backoffCount: number;
}

export type RefusalClass = Extract<
  FailureClass,
  'robots_disallowed' | 'rate_limited' | 'host_unavailable' | 'identity_refused'
>;

export type Admission =
  | { kind: 'go' }
  | { kind: 'decided_block'; sourceId: string }
  | { kind: 'refused'; cls: RefusalClass; detail: string };

export type Transport = 'http' | 'browser' | 'firecrawl';

export interface Observation {
  status?: number;
  retryAfter?: string | null;
  transport: Transport;
}

export interface HostGate {
  admit(url: URL): Promise<Admission>;
  observe(url: URL, outcome: Observation): void;
  hosts(): Record<Host, HostRecord>;
  waited(): Record<Host, number>;
}

export interface HostGateDeps {
  hosts: Record<Host, HostRecord>;
  refused: ReadonlyMap<Host, string>;
  fetchRobots: (origin: string) => Promise<{ status: number; body: string } | null>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  minGapMs?: number;
}

export function hostOf(url: URL): Host {
  return url.host.toLowerCase().replace(/\.(?=(?::\d+)?$)/, '') as Host;
}

export function isHostKey(value: string): value is Host {
  return HOST_KEY.test(value);
}

export function isRobotsRuleList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= ROBOTS_RULES_CAP &&
    value.every(
      (rule) => typeof rule === 'string' && /^[/*]/.test(rule) && rule.length <= ROBOTS_PATTERN_CAP,
    )
  );
}

function isHttpsUrl(value: unknown): value is string {
  try {
    return typeof value === 'string' && new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isStoredSitemapList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= ROBOTS_SITEMAPS_CAP && value.every(isHttpsUrl);
}

export function robotsRecordFits(robots: RobotsRules): boolean {
  return (
    isRobotsRuleList(robots.allow) &&
    isRobotsRuleList(robots.disallow) &&
    isStoredSitemapList(robots.sitemaps)
  );
}

function storedRobots(rules: RobotsRules, origin: string): RobotsRules {
  const sitemaps = new Set<string>();
  for (const sitemap of rules.sitemaps) {
    try {
      const resolved = new URL(sitemap, `${origin}/robots.txt`).toString();
      if (isHttpsUrl(resolved)) sitemaps.add(resolved);
    } catch {
      continue;
    }
  }
  return { ...rules, sitemaps: [...sitemaps].slice(0, ROBOTS_SITEMAPS_CAP) };
}

function emptyRecord(seenAt: string): HostRecord {
  return { seenAt, robots: null, backoffUntil: null, backoffStatus: null, backoffCount: 0 };
}

function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  if (!/[A-Za-z]/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

export function createHostGate(deps: HostGateDeps): HostGate {
  const minGapMs = deps.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const records = new Map<Host, HostRecord>(
    Object.entries(deps.hosts).map(([host, record]) => [host as Host, { ...record }]),
  );
  const tripped = new Map<Host, { cls: RefusalClass; reason: string }>();
  const lastRequestAt = new Map<Host, number>();
  const waited = new Map<Host, number>();

  const iso = () => new Date(deps.now()).toISOString();

  const recordFor = (host: Host): HostRecord => {
    const record = records.get(host) ?? emptyRecord(iso());
    record.seenAt = iso();
    records.set(host, record);
    return record;
  };

  const gapFor = (record: HostRecord): number => {
    const crawlDelayMs = (record.robots?.crawlDelaySec ?? 0) * 1000;
    return Math.max(minGapMs, Math.min(crawlDelayMs, MAX_WAIT_MS));
  };

  const waitUntil = async (host: Host, readyAt: number): Promise<void> => {
    const delay = readyAt - deps.now();
    if (delay <= 0) return;
    waited.set(host, (waited.get(host) ?? 0) + delay);
    await deps.sleep(delay);
  };

  const pace = async (host: Host, record: HostRecord): Promise<void> => {
    const last = lastRequestAt.get(host);
    if (last !== undefined) await waitUntil(host, last + gapFor(record));
    lastRequestAt.set(host, deps.now());
  };

  const robotsFresh = (robots: RobotsRecord | null): robots is RobotsRecord =>
    robots !== null &&
    robots.status !== 'unreachable' &&
    deps.now() - Date.parse(robots.fetchedAt) < ROBOTS_TTL_MS;

  const notRequested = (reason: string, url: URL): string => `${reason}; ${url} not requested`;

  const trip = (host: Host, cls: RefusalClass, reason: string, url: URL): Admission => {
    tripped.set(host, { cls, reason });
    return { kind: 'refused', cls, detail: notRequested(reason, url) };
  };

  const loadRobots = async (url: URL, host: Host, record: HostRecord): Promise<Admission | null> => {
    if (robotsFresh(record.robots)) return null;
    await pace(host, record);
    const response = await deps.fetchRobots(url.origin);
    const fetchedAt = iso();
    const none: RobotsRules = { allow: [], disallow: [], crawlDelaySec: null, sitemaps: [] };
    if (response === null) {
      record.robots = { ...none, fetchedAt, status: 'unreachable' };
      return trip(host, 'host_unavailable', `robots.txt for ${host} was unreachable; host unavailable this run`, url);
    }
    if (response.status >= 500) {
      record.robots = { ...none, fetchedAt, status: 'unreachable' };
      return trip(host, 'host_unavailable', `robots.txt for ${host} returned HTTP ${response.status}; host unavailable this run`, url);
    }
    if (response.status >= 400) {
      record.robots = { ...none, fetchedAt, status: 'absent' };
      return null;
    }
    record.robots = {
      ...storedRobots(parseRobots(response.body, PRODUCT_TOKEN), url.origin),
      fetchedAt,
      status: 'parsed',
    };
    return null;
  };

  const backoffRemaining = (record: HostRecord): number =>
    record.backoffUntil ? Date.parse(record.backoffUntil) - deps.now() : 0;

  return {
    async admit(url) {
      const host = hostOf(url);
      const decidedBy = deps.refused.get(host);
      if (decidedBy !== undefined) return { kind: 'decided_block', sourceId: decidedBy };
      const earlier = tripped.get(host);
      if (earlier) return { kind: 'refused', cls: earlier.cls, detail: notRequested(earlier.reason, url) };
      const record = recordFor(host);
      const remaining = backoffRemaining(record);
      if (remaining > MAX_WAIT_MS) {
        const cls: RefusalClass = record.backoffStatus === 429 ? 'rate_limited' : 'host_unavailable';
        return {
          kind: 'refused',
          cls,
          detail: notRequested(`${host} is backing off until ${record.backoffUntil} after HTTP ${record.backoffStatus ?? 503}`, url),
        };
      }
      if (remaining > 0) await waitUntil(host, deps.now() + remaining);
      const refusal = await loadRobots(url, host, record);
      if (refusal) return refusal;
      if (record.robots && !robotsAllows(record.robots, url)) {
        return { kind: 'refused', cls: 'robots_disallowed', detail: `${url} is disallowed by robots.txt for ${PRODUCT_TOKEN}` };
      }
      await pace(host, record);
      return { kind: 'go' };
    },

    observe(url, outcome) {
      const host = hostOf(url);
      const record = recordFor(host);
      const status = outcome.status;
      if (status === undefined) return;
      if (status === 403) {
        if (outcome.transport === 'browser') {
          tripped.set(host, { cls: 'identity_refused', reason: `HTTP 403 from ${host} earlier this run` });
        }
        return;
      }
      if (status === 429 || status === 503) {
        const nowMs = deps.now();
        const requested = parseRetryAfter(outcome.retryAfter, nowMs);
        if (status === 503 && requested === null) return;
        const fallback = Math.min(BACKOFF_BASE_MS * 2 ** record.backoffCount, BACKOFF_CAP_MS);
        const delay = Math.min(requested ?? fallback, BACKOFF_CAP_MS);
        record.backoffCount += 1;
        record.backoffStatus = status;
        record.backoffUntil = new Date(nowMs + delay).toISOString();
        return;
      }
      if (status < 400) {
        record.backoffCount = 0;
        record.backoffStatus = null;
        record.backoffUntil = null;
      }
    },

    hosts() {
      const cutoff = deps.now() - HOST_RETENTION_MS;
      const out: Record<Host, HostRecord> = {};
      for (const [host, record] of records) {
        if (!isHostKey(host) || Date.parse(record.seenAt) <= cutoff) continue;
        const robots = record.robots && robotsRecordFits(record.robots) ? { ...record.robots } : null;
        out[host] = { ...record, robots };
      }
      return out;
    },

    waited() {
      return Object.fromEntries(waited) as Record<Host, number>;
    },
  };
}

export function robotsFetcher(
  fetchImpl?: typeof fetch,
  resolveHost?: (hostname: string) => Promise<string[]>,
): HostGateDeps['fetchRobots'] {
  return async (origin) => {
    const url = `${origin}/robots.txt`;
    try {
      if (fetchImpl) {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': COLLECTOR_USER_AGENT, Accept: 'text/plain,*/*;q=0.5' },
          redirect: 'follow',
        });
        const body = response.ok
          ? (await readResponseBytes(response, ROBOTS_MAX_BYTES)).toString('utf8')
          : '';
        return { status: response.status, body };
      }
      const retrieved = await retrieveSourceOverHttp1(url, {
        now: () => new Date(),
        timeoutMs: ROBOTS_TIMEOUT_MS,
        maxResponseBytes: ROBOTS_MAX_BYTES,
        destinationPolicy: 'public-https',
        resolveHost,
      });
      const body = retrieved.body || Buffer.from(retrieved.bytes ?? []).toString('utf8');
      return { status: 200, body };
    } catch (error) {
      if (error instanceof SourceFetchError) {
        if (error.status !== undefined) return { status: error.status, body: '' };
        if (error.code === 'destination_mismatch') return { status: 404, body: '' };
      }
      return null;
    }
  };
}
