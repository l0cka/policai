import { isValidCalendarDate } from '@/lib/calendar-date';
import { WATCH_SOURCES, type WatchSource } from './sources';

/**
 * The collector's declared identity (E24, 2026-10-07): every retrieval path
 * (plain HTTP, the headless browser and Firecrawl) presents this token. A
 * source that refuses it is treated as blocked and moves to manual tracking;
 * the only opt-out is a time-boxed `identityException` on the source.
 */
export const COLLECTOR_IDENTITY_TOKEN = 'Policai/1.0 (+https://policai.org)';

/** Plain HTTP user agent (Node fetch and the HTTP/1.1 fallback). */
export const COLLECTOR_USER_AGENT = `Mozilla/5.0 (compatible; ${COLLECTOR_IDENTITY_TOKEN})`;

/**
 * Chrome version used when the rendering browser's own version is unknown:
 * Firecrawl's renderer, and a launched browser that does not report one.
 * Matches the playwright-core Chromium build audited on 2026-10-07.
 */
export const REFERENCE_CHROME_VERSION = '149.0.0.0';

/**
 * 'declared' presents the Policai identity; 'exempt' is reserved for a
 * source whose identity exception is still current.
 */
export type CollectorIdentity = 'declared' | 'exempt';

export interface SourceIdentityException {
  /** Exclusive expiry: START of this Australia/Sydney calendar day. */
  until: string;
  /** Why the source may not identify itself, with the decision reference. */
  reason: string;
}

export type IdentityExceptionState = 'none' | 'active' | 'expired';

/**
 * Fetch init accepted by the collector's fetch implementations. The browser
 * rechecks `identityAuthority` for every destination; Node fetch ignores
 * these keys. `collectorIdentity` is an assessment for diagnostics/tests only.
 */
export interface CollectorRequestInit extends RequestInit {
  /** Diagnostic only: never grants authority. */
  collectorIdentity?: CollectorIdentity;
  identityAuthority?: IdentityAuthority;
}

/** The collector's calendar day; the collection host runs in Sydney. */
export function collectorCalendarDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

/**
 * Whether a source's identity exception applies on `now`. An exception is
 * honoured only BEFORE its `until` day starts in Sydney; a malformed
 * date or clock is never honoured. Outgoing permission additionally requires
 * a registered source and matching destination (destinationCollectorIdentity).
 */
export function identityExceptionState(
  source: Pick<WatchSource, 'identityException'>,
  now: Date,
): IdentityExceptionState {
  const exception = source.identityException;
  if (!exception) return 'none';
  if (!Number.isFinite(now.getTime()) || !isValidCalendarDate(exception.until)) return 'expired';
  return collectorCalendarDate(now) < exception.until ? 'active' : 'expired';
}

export function collectorIdentityFor(
  source: Pick<WatchSource, 'identityException'>,
  now: Date,
): CollectorIdentity {
  return identityExceptionState(source, now) === 'active'
    ? 'exempt'
    : 'declared';
}

/** Source-bound permission; every transport rechecks destination and wall clock. */
export interface IdentityAuthority {
  sourceId: string;
  sourceUrl: string;
  until: string;
}

export function identityAuthorityFor(
  source: WatchSource,
): IdentityAuthority | undefined {
  if (!source.identityException) return undefined;
  return {
    sourceId: source.id,
    sourceUrl: source.url,
    until: source.identityException.until,
  };
}

export function destinationCollectorIdentity(
  authority: IdentityAuthority | undefined,
  destination: string,
  now: Date = new Date(),
): CollectorIdentity {
  if (!authority || !Number.isFinite(now.getTime())) return 'declared';
  const registered = WATCH_SOURCES.find(
    source => source.id === authority.sourceId,
  );
  if (
    !registered?.identityException ||
    registered.url !== authority.sourceUrl ||
    registered.identityException.until !== authority.until ||
    identityExceptionState(registered, now) !== 'active'
  ) return 'declared';
  try {
    const target = new URL(destination);
    const origin = new URL(authority.sourceUrl);
    if (
      target.protocol !== 'https:' || target.username || target.password ||
      target.origin !== origin.origin
    ) return 'declared';
    return 'exempt';
  } catch {
    return 'declared';
  }
}

export interface ResolvedSourceIdentity {
  identity: CollectorIdentity;
  state: IdentityExceptionState;
  /** One-line operator note, or null when the source has no exception. */
  note: string | null;
}

/**
 * Identity a source retrieves with on `now`, plus the operator note that
 * `npm run audit:sources` prints beside it. Built on `identityExceptionState`,
 * the same rule the collector applies.
 */
export function resolveSourceIdentity(
  source: Pick<WatchSource, 'identityException'>,
  now: Date,
): ResolvedSourceIdentity {
  const state = identityExceptionState(source, now);
  const until = source.identityException?.until;
  if (state === 'active') {
    return {
      identity: 'exempt',
      state,
      note: `identity exception active until ${until}`,
    };
  }
  if (state === 'expired') {
    return {
      identity: 'declared',
      state,
      note: `identity exception expired on ${until}`,
    };
  }
  return { identity: 'declared', state, note: null };
}

/** Identity requested through a fetch init; anything unrecognised declares. */
export function requestedCollectorIdentity(
  init?: RequestInit,
  destination = '',
): CollectorIdentity {
  return destinationCollectorIdentity(
    (init as CollectorRequestInit | undefined)?.identityAuthority,
    destination,
  );
}

function userAgentPlatform(): string {
  if (process.platform === 'darwin') return 'Macintosh; Intel Mac OS X 10_15_7';
  if (process.platform === 'win32') return 'Windows NT 10.0; Win64; x64';
  return 'X11; Linux x86_64';
}

/**
 * Reduced Chrome user agent for the given build, so client-hint headers stay
 * consistent with the UA string; the default headless user agent advertises
 * "HeadlessChrome", which host-side heuristics reject. The declared identity
 * appends the Policai token.
 */
export function browserUserAgent(
  chromeVersion: string,
  identity: CollectorIdentity = 'declared',
): string {
  const chrome = `Mozilla/5.0 (${userAgentPlatform()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  return identity === 'exempt' ? chrome : `${chrome} ${COLLECTOR_IDENTITY_TOKEN}`;
}

/** Firecrawl has no per-hop exception support: always declare its identity. */
export function firecrawlRequestHeaders(): Record<string, string> {
  return { 'User-Agent': browserUserAgent(REFERENCE_CHROME_VERSION) };
}
