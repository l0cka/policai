/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  browserUserAgent,
  COLLECTOR_IDENTITY_TOKEN,
  COLLECTOR_USER_AGENT,
  collectorIdentityFor,
  firecrawlRequestHeaders,
  identityExceptionState,
  requestedCollectorIdentity,
  resolveSourceIdentity,
} from './identity';

const EXCEPTION = { until: '2026-10-21', reason: 'allow-list request pending' };

describe('collector identity', () => {
  it('uses one identity token for every retrieval path', () => {
    expect(COLLECTOR_IDENTITY_TOKEN).toBe('Policai/1.0 (+https://policai.org)');
    expect(COLLECTOR_USER_AGENT).toBe(
      `Mozilla/5.0 (compatible; ${COLLECTOR_IDENTITY_TOKEN})`,
    );
  });

  it('appends the identity token to the Chrome user agent by default', () => {
    const userAgent = browserUserAgent('149.0.0.0');
    expect(userAgent).toMatch(
      /^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/149\.0\.0\.0 Safari\/537\.36 Policai\/1\.0 \(\+https:\/\/policai\.org\)$/,
    );
    expect(userAgent).not.toContain('Headless');
  });

  it('presents the plain Chrome user agent only for an exempt request', () => {
    const userAgent = browserUserAgent('149.0.0.0', 'exempt');
    expect(userAgent).toMatch(/Chrome\/149\.0\.0\.0 Safari\/537\.36$/);
    expect(userAgent).not.toContain('Policai');
  });

  it('sends the declared identity to Firecrawl unless the source is exempt', () => {
    expect(firecrawlRequestHeaders('declared')?.['User-Agent']).toMatch(
      / Policai\/1\.0 \(\+https:\/\/policai\.org\)$/,
    );
    expect(firecrawlRequestHeaders('exempt')).toBeUndefined();
  });

  it('reads the requested identity from the fetch init, declared by default', () => {
    expect(requestedCollectorIdentity()).toBe('declared');
    expect(requestedCollectorIdentity({ headers: {} })).toBe('declared');
    expect(
      requestedCollectorIdentity({
        collectorIdentity: 'exempt',
      } as RequestInit),
    ).toBe('exempt');
    expect(
      requestedCollectorIdentity({
        collectorIdentity: 'anything-else',
      } as unknown as RequestInit),
    ).toBe('declared');
  });
});

describe('identity exceptions', () => {
  it('treats a source without an exception as declared', () => {
    const now = new Date('2026-10-07T00:00:00.000Z');
    expect(identityExceptionState({}, now)).toBe('none');
    expect(collectorIdentityFor({}, now)).toBe('declared');
  });

  it('honours an exception up to and including its until date (Sydney)', () => {
    const source = { identityException: EXCEPTION };
    for (const iso of [
      '2026-10-07T00:00:00.000Z',
      // 2026-10-21 23:59 in Sydney (AEDT, UTC+11).
      '2026-10-21T12:59:00.000Z',
    ]) {
      const now = new Date(iso);
      expect(identityExceptionState(source, now)).toBe('active');
      expect(collectorIdentityFor(source, now)).toBe('exempt');
    }
  });

  it('ignores an exception after its until date', () => {
    const source = { identityException: EXCEPTION };
    for (const iso of [
      // 2026-10-22 00:00 in Sydney, still 21 Oct in UTC.
      '2026-10-21T13:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ]) {
      const now = new Date(iso);
      expect(identityExceptionState(source, now)).toBe('expired');
      expect(collectorIdentityFor(source, now)).toBe('declared');
    }
  });

  it('never honours an exception whose until date is malformed', () => {
    const now = new Date('2026-10-07T00:00:00.000Z');
    for (const until of ['', '21/10/2026', '2026-02-30', 'later']) {
      const source = { identityException: { until, reason: 'x' } };
      expect(identityExceptionState(source, now)).toBe('expired');
      expect(collectorIdentityFor(source, now)).toBe('declared');
    }
  });
});

describe('resolveSourceIdentity (collector and audit:sources)', () => {
  it('declares the identity with no note for a source without an exception', () => {
    expect(
      resolveSourceIdentity({}, new Date('2026-10-07T00:00:00.000Z')),
    ).toEqual({ identity: 'declared', state: 'none', note: null });
  });

  it('exempts a source while its exception is live and says until when', () => {
    expect(
      resolveSourceIdentity(
        { identityException: EXCEPTION },
        new Date('2026-10-21T12:59:00.000Z'),
      ),
    ).toEqual({
      identity: 'exempt',
      state: 'active',
      note: 'identity exception active until 2026-10-21',
    });
  });

  it('declares the identity once the exception has expired and says so', () => {
    expect(
      resolveSourceIdentity(
        { identityException: EXCEPTION },
        new Date('2026-10-21T13:00:00.000Z'),
      ),
    ).toEqual({
      identity: 'declared',
      state: 'expired',
      note: 'identity exception expired on 2026-10-21',
    });
  });
});
