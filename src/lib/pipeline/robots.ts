export const ROBOTS_MAX_BYTES = 500 * 1024;
export const CRAWL_DELAY_CAP_SEC = 24 * 60 * 60;

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec: number | null;
  sitemaps: string[];
}

const UNRESERVED_OR_DELIMITER = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/;
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const PERCENT_ESCAPE = /^%[0-9A-Fa-f]{2}$/;
const CRAWL_DELAY = /^\d+(?:\.\d+)?$/;

function normalizeForMatch(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; ) {
    const char = value[index];
    const escape = value.slice(index, index + 3);
    if (char === '%' && PERCENT_ESCAPE.test(escape)) {
      const decoded = String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      out += UNRESERVED.test(decoded) ? decoded : escape.toUpperCase();
      index += 3;
      continue;
    }
    const codePoint = value.codePointAt(index) ?? 0;
    const unit = String.fromCodePoint(codePoint);
    index += unit.length;
    if (UNRESERVED_OR_DELIMITER.test(unit)) {
      out += unit;
      continue;
    }
    for (const byte of new TextEncoder().encode(unit)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

function wildcardMatch(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let starP = -1;
  let starT = -1;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') {
      starP = p++;
      starT = t;
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p++;
      t++;
    } else if (starP >= 0) {
      p = starP + 1;
      t = ++starT;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

export function matchesRobotsPattern(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = normalizeForMatch(anchored ? pattern.slice(0, -1) : pattern);
  return wildcardMatch(anchored ? body : `${body}*`, normalizeForMatch(path));
}

export function robotsAllows(
  rules: Pick<RobotsRules, 'allow' | 'disallow'>,
  url: URL,
): boolean {
  const path = `${url.pathname}${url.search}`;
  const longest = (patterns: string[]) =>
    patterns.reduce(
      (best, pattern) =>
        pattern.length > best && matchesRobotsPattern(pattern, path) ? pattern.length : best,
      -1,
    );
  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);
  return disallow < 0 || allow >= disallow;
}

function truncateToByteCap(body: string): string {
  const bytes = new TextEncoder().encode(body);
  if (bytes.byteLength <= ROBOTS_MAX_BYTES) return body;
  const head = new TextDecoder().decode(bytes.subarray(0, ROBOTS_MAX_BYTES));
  return head.slice(0, head.lastIndexOf('\n') + 1);
}

function productToken(agent: string): string {
  return agent.split('/')[0].trim().toLowerCase();
}

export function parseRobots(body: string, token: string): RobotsRules {
  const ours = token.toLowerCase();
  const groups = new Map<string, RobotsRules>();
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let collecting = false;

  const groupFor = (agent: string): RobotsRules => {
    let group = groups.get(agent);
    if (!group) {
      group = { allow: [], disallow: [], crawlDelaySec: null, sitemaps: [] };
      groups.set(agent, group);
    }
    return group;
  };

  for (const rawLine of truncateToByteCap(body).replace(/^﻿/, '').split(/\r?\n|\r/)) {
    const line = rawLine.replace(/\0/g, '').split('#')[0];
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (collecting) {
        agents = [];
        collecting = false;
      }
      const agent = productToken(value);
      if (agent) {
        agents.push(agent);
        groupFor(agent);
      }
      continue;
    }
    if (agents.length === 0) continue;
    if (field === 'allow' || field === 'disallow') {
      collecting = true;
      if (!value || !(value.startsWith('/') || value.startsWith('*'))) continue;
      for (const agent of agents) groupFor(agent)[field].push(value);
      continue;
    }
    if (field === 'crawl-delay') {
      collecting = true;
      if (!CRAWL_DELAY.test(value)) continue;
      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0) continue;
      const seconds = Number.isFinite(parsed)
        ? Math.min(parsed, CRAWL_DELAY_CAP_SEC)
        : CRAWL_DELAY_CAP_SEC;
      for (const agent of agents) {
        const group = groupFor(agent);
        group.crawlDelaySec ??= seconds;
      }
    }
  }

  const selected = groups.get(ours) ?? groups.get('*');
  return {
    allow: selected?.allow ?? [],
    disallow: selected?.disallow ?? [],
    crawlDelaySec: selected?.crawlDelaySec ?? null,
    sitemaps,
  };
}
