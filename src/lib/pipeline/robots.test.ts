/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  matchesRobotsPattern,
  parseRobots,
  ROBOTS_MAX_BYTES,
  robotsAllows,
} from './robots';

const url = (path: string) => new URL(path, 'https://www.example.gov.au');

describe('matchesRobotsPattern', () => {
  it.each<[pattern: string, path: string, expected: boolean]>([
    ['/', '/', true],
    ['/', '/anything/at/all', true],
    ['/fish', '/fish', true],
    ['/fish', '/fish.html', true],
    ['/fish', '/fish/salmon.html', true],
    ['/fish', '/fishheads', true],
    ['/fish', '/fishheads/yummy.html', true],
    ['/fish', '/fish.php?id=anything', true],
    ['/fish', '/Fish.asp', false],
    ['/fish', '/catfish', false],
    ['/fish', '/?id=fish', false],
    ['/fish*', '/fish', true],
    ['/fish*', '/fishheads/yummy.html', true],
    ['/fish/', '/fish/', true],
    ['/fish/', '/fish/?id=anything', true],
    ['/fish/', '/fish/salmon.htm', true],
    ['/fish/', '/fish', false],
    ['/fish/', '/fish.html', false],
    ['/fish/', '/Fish/Salmon.asp', false],
    ['/*.php', '/filename.php', true],
    ['/*.php', '/folder/filename.php', true],
    ['/*.php', '/folder/filename.php?parameters', true],
    ['/*.php', '/folder/any.php.file.html', true],
    ['/*.php', '/filename.php/', true],
    ['/*.php', '/', false],
    ['/*.php', '/windows.PHP', false],
    ['/*.php$', '/filename.php', true],
    ['/*.php$', '/folder/filename.php', true],
    ['/*.php$', '/filename.php?parameters', false],
    ['/*.php$', '/filename.php/', false],
    ['/*.php$', '/filename.php5', false],
    ['/*.php$', '/windows.PHP', false],
    ['/fish*.php', '/fish.php', true],
    ['/fish*.php', '/fishheads/catfish.php?parameters', true],
    ['/fish*.php', '/Fish.PHP', false],
    ['/$', '/', true],
    ['/$', '/page', false],
    ['*', '/anything', true],
    ['/a*b*c*d*e*f*g*h*i*j*k', '/aXbXcXdXeXfXgXhXiXjXk', true],
    ['/a*b*c*d*e*f*g*h*i*j*k', '/' + 'a'.repeat(5000), false],
    ['/**/x', '/y/x', true],
    ['/path$extra', '/path$extra', true],
    ['/path$extra', '/path', false],
    ['/café', '/caf%C3%A9', true],
    ['/caf%C3%A9', '/café', true],
    ['/caf%c3%a9', '/caf%C3%A9', true],
    ['/foo/bar?baz=https://foo.bar', '/foo/bar?baz=https://foo.bar', true],
    ['/foo/bar/%62%61%7A', '/foo/bar/%62%61%7A', true],
    ['/foo/bar/%62%61%7A', '/foo/bar/baz', false],
  ])('%j against %j is %s', (pattern, path, expected) => {
    expect(matchesRobotsPattern(pattern, path)).toBe(expected);
  });
});

describe('robotsAllows', () => {
  it.each<[allow: string[], disallow: string[], path: string, expected: boolean]>([
    [['/p'], ['/'], '/page', true],
    [['/folder'], ['/folder'], '/folder/page', true],
    [['/page'], ['/*.htm'], '/page.htm', false],
    [['/page'], ['/*.ph'], '/page.php5', true],
    [['/$'], ['/'], '/', true],
    [['/$'], ['/'], '/page.htm', false],
    [[], [], '/anything', true],
    [[], ['/'], '/anything', false],
    [[], ['/private'], '/public', true],
    [['/private/open'], ['/private'], '/private/open/file', true],
    [['/private/open'], ['/private'], '/private/other', false],
    [[], ['/*?'], '/search?q=ai', false],
    [[], ['/*?'], '/search', true],
    [[], ['/news'], '/News', true],
  ])('allow %j disallow %j for %j is %s', (allow, disallow, path, expected) => {
    expect(robotsAllows({ allow, disallow }, url(path))).toBe(expected);
  });

  it('matches against the path and query, never the fragment or host', () => {
    expect(robotsAllows({ allow: [], disallow: ['/a?x=1'] }, url('/a?x=1#frag'))).toBe(false);
    expect(robotsAllows({ allow: [], disallow: ['/a#frag'] }, url('/a'))).toBe(true);
    expect(robotsAllows({ allow: [], disallow: ['/www.example.gov.au'] }, url('/'))).toBe(true);
  });
});

describe('parseRobots', () => {
  const empty = { allow: [], disallow: [], crawlDelaySec: null, sitemaps: [] };

  it('returns allow-all for an empty body', () => {
    expect(parseRobots('', 'Policai')).toEqual(empty);
  });

  it('selects the Policai group over the wildcard group', () => {
    const body = [
      'User-agent: *',
      'Disallow: /everyone',
      '',
      'User-agent: Policai',
      'Disallow: /policai-only',
      'Allow: /policai-only/open',
      'Crawl-delay: 7',
    ].join('\n');
    expect(parseRobots(body, 'Policai')).toEqual({
      allow: ['/policai-only/open'],
      disallow: ['/policai-only'],
      crawlDelaySec: 7,
      sitemaps: [],
    });
  });

  it('falls back to the wildcard group when no group names the token', () => {
    const body = ['User-agent: Googlebot', 'Disallow: /g', '', 'User-agent: *', 'Disallow: /all'].join('\n');
    expect(parseRobots(body, 'Policai').disallow).toEqual(['/all']);
  });

  it('has no rules when neither the token nor the wildcard has a group', () => {
    const body = ['User-agent: Googlebot', 'Disallow: /g'].join('\n');
    expect(parseRobots(body, 'Policai')).toEqual(empty);
  });

  it.each([
    'User-agent: policai',
    'USER-AGENT: POLICAI',
    'user-agent: Policai/1.0',
    'User-Agent:Policai   ',
    '\tUser-agent  :  Policai # our crawler',
  ])('matches the product token case-insensitively and with a version: %j', (line) => {
    expect(parseRobots(`${line}\nDisallow: /x`, 'Policai').disallow).toEqual(['/x']);
  });

  it.each([
    'User-agent: PolicaiBot',
    'User-agent: Policai-Reader',
    'User-agent: NotPolicai',
    'User-agent: Policai 1.0',
  ])('does not treat a different product token as ours: %j', (line) => {
    expect(parseRobots(`${line}\nDisallow: /x`, 'Policai')).toEqual(empty);
  });

  it('merges several groups for the same agent and consecutive user-agent lines', () => {
    const body = [
      'User-agent: a',
      'User-agent: Policai',
      'Disallow: /one',
      '',
      'User-agent: b',
      'Disallow: /b',
      '',
      'User-agent: Policai',
      'Disallow: /two',
    ].join('\n');
    expect(parseRobots(body, 'Policai').disallow).toEqual(['/one', '/two']);
  });

  it('starts a new group after rules when a user-agent line follows', () => {
    const body = ['User-agent: *', 'Disallow: /a', 'User-agent: Policai', 'Disallow: /b'].join('\n');
    expect(parseRobots(body, 'Policai').disallow).toEqual(['/b']);
  });

  it('ignores rules before any user-agent line', () => {
    expect(parseRobots('Disallow: /\nUser-agent: *\nDisallow: /a', 'Policai').disallow).toEqual(['/a']);
  });

  it('ignores an empty disallow and a rule that starts with neither / nor *', () => {
    const body = ['User-agent: *', 'Disallow:', 'Disallow: admin', 'Disallow: http://x/y', 'Disallow: *.pdf', 'Allow: /ok'].join('\n');
    expect(parseRobots(body, 'Policai')).toEqual({ ...empty, disallow: ['*.pdf'], allow: ['/ok'] });
  });

  it('strips comments, a BOM, CRLF line endings and surrounding whitespace', () => {
    const body = '﻿# header\r\nUser-agent: *   # all\r\n  Disallow : /a # trailing\r\n\r\nAllow: /a/b#fragment-comment\r\n';
    expect(parseRobots(body, 'Policai')).toEqual({ ...empty, disallow: ['/a'], allow: ['/a/b'] });
  });

  it('reads field names case-insensitively and ignores unknown fields', () => {
    const body = ['USER-AGENT: *', 'DISALLOW: /a', 'ALLOW: /b', 'CRAWL-DELAY: 2.5', 'Host: example', 'Noindex: /x'].join('\n');
    expect(parseRobots(body, 'Policai')).toEqual({ allow: ['/b'], disallow: ['/a'], crawlDelaySec: 2.5, sitemaps: [] });
  });

  it('collects Sitemap lines from anywhere in the file', () => {
    const body = ['Sitemap: https://www.example.gov.au/sitemap.xml', 'User-agent: other', 'Sitemap: https://www.example.gov.au/news.xml', 'Disallow: /'].join('\n');
    expect(parseRobots(body, 'Policai').sitemaps).toEqual([
      'https://www.example.gov.au/sitemap.xml',
      'https://www.example.gov.au/news.xml',
    ]);
  });

  it.each(['-1', 'abc', '', '1e400', 'NaN', 'Infinity', '0x10'])(
    'treats a crawl-delay of %j as absent',
    (value) => {
      expect(parseRobots(`User-agent: *\nCrawl-delay: ${value}`, 'Policai').crawlDelaySec).toBeNull();
    },
  );

  it('keeps the first crawl-delay of the selected group', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 3\nCrawl-delay: 9', 'Policai').crawlDelaySec).toBe(3);
  });

  it('ignores a crawl-delay from another group', () => {
    const body = 'User-agent: *\nCrawl-delay: 30\nUser-agent: Policai\nDisallow: /x';
    expect(parseRobots(body, 'Policai').crawlDelaySec).toBeNull();
  });

  it('parses only the first 500 KiB and drops the cut line', () => {
    const line = 'Disallow: /path-with-a-long-name-0000000000000000000000000000/\n';
    const head = 'User-agent: *\n';
    const repeats = Math.ceil(ROBOTS_MAX_BYTES / line.length) + 50;
    const body = head + line.repeat(repeats) + 'Allow: /after-the-cap\n';
    const rules = parseRobots(body, 'Policai');
    expect(rules.allow).toEqual([]);
    expect(rules.disallow.length).toBeLessThan(repeats);
    expect(rules.disallow.length).toBeGreaterThan(0);
    expect(rules.disallow.every((rule) => rule === line.slice('Disallow: '.length).trim())).toBe(true);
  });

  it('survives hostile input: NUL bytes, lone surrogates, huge lines and HTML', () => {
    const hostile = [
      '<!DOCTYPE html><html><body>Not found</body></html>',
      'User-agent: *\u0000',
      'Disallow: /\u0000x',
      'Disallow: /' + 'a'.repeat(100_000),
      'Disallow: /\uD800',
      'Allow:' + ':'.repeat(1000),
    ].join('\n');
    const rules = parseRobots(hostile, 'Policai');
    expect(rules.disallow).toHaveLength(3);
    expect(rules.disallow[1]).toHaveLength(100_001);
    expect(robotsAllows(rules, url('/' + 'a'.repeat(100_000) + '/b'))).toBe(false);
    expect(robotsAllows(rules, url('/b'))).toBe(true);
  });

  it('parses an HTML error page served as robots.txt as allow-all', () => {
    expect(parseRobots('<html><head><title>404</title></head><body>No such file</body></html>', 'Policai')).toEqual(empty);
  });

  it('matches the RFC 9309 group example', () => {
    const body = [
      'User-Agent: ExampleBot',
      'Allow: /publications/',
      'Disallow: /',
      '',
      'User-Agent: *',
      'Disallow: /example/',
      'Allow: /publications/',
    ].join('\n');
    const rules = parseRobots(body, 'Policai');
    expect(robotsAllows(rules, url('/example/page.html'))).toBe(false);
    expect(robotsAllows(rules, url('/publications/report.pdf'))).toBe(true);
    expect(robotsAllows(rules, url('/other'))).toBe(true);
    const exampleBot = parseRobots(body, 'ExampleBot');
    expect(robotsAllows(exampleBot, url('/publications/report.pdf'))).toBe(true);
    expect(robotsAllows(exampleBot, url('/other'))).toBe(false);
  });
});
