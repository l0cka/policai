/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { emptyWatchState } from './collect';
import {
  createHostGate,
  hostOf,
  isHostKey,
  isRobotsRuleList,
  isStoredSitemapList,
  ROBOTS_PATTERN_CAP,
  ROBOTS_RULES_CAP,
  ROBOTS_SITEMAPS_CAP,
  type Host,
  type HostGateDeps,
} from './host-gate';
import { validateWatchState } from '@/lib/validate-data';

const START = Date.parse('2026-10-20T19:30:00.000Z');

const ROBOTS_BODIES: Array<[label: string, body: string]> = [
  ['http sitemap', 'User-agent: *\nDisallow: /x\nSitemap: http://www.h.gov.au/sitemap.xml\n'],
  ['relative sitemap', 'User-agent: *\nSitemap: /sitemap.xml\n'],
  ['bare relative sitemap', 'Sitemap: sitemap.xml\n'],
  ['junk sitemaps', 'Sitemap: ftp://www.h.gov.au/s.xml\nSitemap: not a url\nSitemap: javascript:alert(1)\nSitemap: https://www.h.gov.au/ok.xml\n'],
  ['duplicate sitemaps', 'Sitemap: https://www.h.gov.au/s.xml\nSitemap: https://www.h.gov.au/s.xml\n'],
  ['too many sitemaps', Array.from({ length: ROBOTS_SITEMAPS_CAP + 5 }, (_, i) => `Sitemap: https://www.h.gov.au/s${i}.xml`).join('\n')],
  ['too many rules', `User-agent: *\n${Array.from({ length: ROBOTS_RULES_CAP + 1 }, (_, i) => `Disallow: /r${i}`).join('\n')}`],
  ['oversized rule', `User-agent: *\nDisallow: /${'a'.repeat(ROBOTS_PATTERN_CAP)}`],
  ['drupal', `User-agent: *\nCrawl-delay: 10\n${Array.from({ length: 60 }, (_, i) => `Disallow: /core/path-${i}/`).join('\n')}\nSitemap: https://www.h.gov.au/sitemap.xml\n`],
  ['empty', ''],
  ['html page', '<html><body>Home</body></html>'],
  ['bom crlf', '﻿User-agent: *\r\nDisallow: /x\r\nSitemap: HTTPS://WWW.H.GOV.AU/S.XML\r\n'],
  ['nul and odd crawl delay', 'User-agent: *\u0000\nCrawl-delay: 1e400\nDisallow: /x\n'],
];

const URLS = [
  'https://www.h.gov.au/x',
  'https://www.h.gov.au./x',
  'https://WWW.H.GOV.AU/x',
  'https://www.h.gov.au:8443/x',
  'https://www.h.gov.au.:8443/x',
  'https://[2001:db8::1]/x',
  'https://[2001:db8::1]:8443/x',
  'https://127.0.0.1:3003/x',
  'https://bücher.gov.au/x',
];

const RESPONSES: Array<[label: string, respond: (body: string) => { status: number; body: string } | null]> = [
  ['200', (body) => ({ status: 200, body })],
  ['404', (body) => ({ status: 404, body })],
  ['503', (body) => ({ status: 503, body })],
  ['unreachable', () => null],
];

function gateFor(fetchRobots: HostGateDeps['fetchRobots'], hosts: HostGateDeps['hosts'] = {}) {
  let clock = START;
  return createHostGate({
    hosts,
    refused: new Map(),
    fetchRobots,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
}

describe('the stored host state always passes validateWatchState', () => {
  it.each(ROBOTS_BODIES)('robots.txt %s, every host and response', async (_label, body) => {
    for (const [, respond] of RESPONSES) {
      const gate = gateFor(async () => respond(body));
      for (const url of URLS) {
        await gate.admit(new URL(url));
        gate.observe(new URL(url), { status: 429, retryAfter: '7200', transport: 'http' });
      }
      const hosts = gate.hosts();
      expect(validateWatchState({ ...emptyWatchState(), hosts }).errors).toEqual([]);
      expect(Object.keys(hosts).every(isHostKey)).toBe(true);
      const reloaded = gateFor(async () => respond(body), hosts);
      for (const url of URLS) await reloaded.admit(new URL(url));
      expect(validateWatchState({ ...emptyWatchState(), hosts: reloaded.hosts() }).errors).toEqual([]);
    }
  });

  it('merges a trailing-dot host into its canonical record and leaves IP literals out of the state', async () => {
    const gate = gateFor(async () => ({ status: 200, body: 'User-agent: *\nDisallow: /x\n' }));
    for (const url of URLS) await gate.admit(new URL(url));
    const hosts = gate.hosts();
    expect(Object.keys(hosts).sort()).toEqual(['127.0.0.1:3003', 'www.h.gov.au', 'www.h.gov.au:8443', 'xn--bcher-kva.gov.au']);
    expect(hostOf(new URL('https://www.h.gov.au./x'))).toBe('www.h.gov.au');
    expect(hostOf(new URL('https://www.h.gov.au.:8443/x'))).toBe('www.h.gov.au:8443');
    expect(hostOf(new URL('https://[2001:db8::1]/x'))).toBe('[2001:db8::1]');
  });

  it('stores sitemaps resolved against the robots URL, https only, deduplicated and capped', async () => {
    const gate = gateFor(async () => ({
      status: 200,
      body: [
        'Sitemap: /relative.xml',
        'Sitemap: bare.xml',
        'Sitemap: http://www.h.gov.au/insecure.xml',
        'Sitemap: HTTPS://WWW.H.GOV.AU/Upper.xml',
        'Sitemap: https://www.h.gov.au/dup.xml',
        'Sitemap: https://www.h.gov.au/dup.xml',
        'Sitemap: ftp://www.h.gov.au/ftp.xml',
        ...Array.from({ length: ROBOTS_SITEMAPS_CAP + 5 }, (_, i) => `Sitemap: https://www.h.gov.au/s${i}.xml`),
      ].join('\n'),
    }));
    await gate.admit(new URL('https://www.h.gov.au/x'));
    const sitemaps = gate.hosts()['www.h.gov.au' as Host]?.robots?.sitemaps ?? [];
    expect(sitemaps.slice(0, 4)).toEqual([
      'https://www.h.gov.au/relative.xml',
      'https://www.h.gov.au/bare.xml',
      'https://www.h.gov.au/Upper.xml',
      'https://www.h.gov.au/dup.xml',
    ]);
    expect(sitemaps).toHaveLength(ROBOTS_SITEMAPS_CAP);
    expect(isStoredSitemapList(sitemaps)).toBe(true);
  });

  it('the validator and the gate share one definition of a rule list and a sitemap list', () => {
    expect(isRobotsRuleList(['/a', '*'])).toBe(true);
    expect(isRobotsRuleList(['a'])).toBe(false);
    expect(isRobotsRuleList([`/${'a'.repeat(ROBOTS_PATTERN_CAP)}`])).toBe(false);
    expect(isRobotsRuleList(Array.from({ length: ROBOTS_RULES_CAP + 1 }, () => '/'))).toBe(false);
    expect(isStoredSitemapList(['https://www.h.gov.au/s.xml'])).toBe(true);
    expect(isStoredSitemapList(['http://www.h.gov.au/s.xml'])).toBe(false);
    expect(isStoredSitemapList(['/s.xml'])).toBe(false);
    expect(isHostKey('www.h.gov.au:8443')).toBe(true);
    expect(isHostKey('www.h.gov.au.')).toBe(false);
    expect(isHostKey('[2001:db8::1]')).toBe(false);
  });
});
