/**
 * Site reuse survey: for each host in data/bodies.json, finds the site's
 * copyright or licence page and reports the licence statements on it, as
 * evidence for an editor to record in data/site-reuse.json. It never writes
 * that file.
 *
 * Retrieval declares the collector identity, obeys robots.txt and waits 2 s
 * between requests to a host. A host that refuses us is reported as refused;
 * the survey does not retry it another way.
 *
 * Usage:
 *   npm run survey:site-reuse -- --out=<file.json> [--host=<host>]...
 */

import { writeFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { getBodies } from '../src/lib/data-service';
import { createBrowserFetch } from '../src/lib/pipeline/browser-fetch';
import { looksLikeBotChallenge } from '../src/lib/pipeline/fetch';
import { COLLECTOR_IDENTITY_TOKEN, COLLECTOR_USER_AGENT } from '../src/lib/pipeline/identity';
import { parseRobots, robotsAllows, type RobotsRules } from '../src/lib/pipeline/robots';

const GAP_MS = 2000;
const TIMEOUT_MS = 30_000;
const MAX_CANDIDATES = 4;
const EXCERPT_RADIUS = 280;
const LINK_TEXT = /copyright|licen[cs]|terms of use|reuse|re-use|disclaimer/i;
const FALLBACK_PATHS = ['/copyright', '/about/copyright', '/copyright-statement'];
const STATEMENT = new RegExp(
  [
    'creative\\s*commons[^.]{0,120}',
    'creativecommons\\.org/licen[cs]es/[a-z-]+/\\d\\.\\d(?:/[a-z]{2})?',
    'attribution(?:[- ](?:non-?commercial|no-?derivatives|share-?alike))*\\s+\\d\\.\\d\\s*(?:international|australia)?',
    'cc[- ]by(?:[- ](?:nc|nd|sa))*(?:[- ]\\d\\.\\d)?',
    'all rights (?:are )?reserved',
    'crown copyright',
    'copyright act 1968',
  ].join('|'),
  'gi',
);

interface Page {
  url: string;
  status: number;
  via: 'http' | 'browser';
  html: string;
}

type Outcome =
  | { kind: 'ok'; page: Page }
  | { kind: 'refused'; detail: string };

interface CandidateReport {
  url: string;
  status: number | null;
  via?: 'http' | 'browser';
  title?: string;
  statements: string[];
  excerpts: string[];
  error?: string;
}

interface HostReport {
  host: string;
  bodyIds: string[];
  checkedAt: string;
  robots: 'parsed' | 'absent' | 'unreachable';
  home: { url: string; status: number | null; via?: 'http' | 'browser'; error?: string };
  candidates: CandidateReport[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argValues(name: string): string[] {
  return process.argv
    .filter((arg) => arg.startsWith(`--${name}=`))
    .map((arg) => arg.slice(name.length + 3));
}

function textOf(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  const title = $('title').first().text().trim();
  const main = $('main').length ? $('main') : $('body');
  return { title, text: main.text().replace(/\s+/g, ' ').trim() };
}

function statementsIn(text: string): { statements: string[]; excerpts: string[] } {
  const statements = new Set<string>();
  const excerpts: string[] = [];
  let lastEnd = -1;
  for (const match of text.matchAll(STATEMENT)) {
    statements.add(match[0].toLowerCase().replace(/\s+/g, ' ').trim());
    const start = Math.max(0, match.index - EXCERPT_RADIUS);
    if (start < lastEnd) continue;
    lastEnd = match.index + match[0].length + EXCERPT_RADIUS;
    excerpts.push(text.slice(start, lastEnd));
    if (excerpts.length >= 6) break;
  }
  return { statements: [...statements], excerpts };
}

function candidateLinks(html: string, base: string, host: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];
  $('a[href]').each((_, element) => {
    const text = `${$(element).text()} ${$(element).attr('href')}`;
    if (!LINK_TEXT.test(text)) return;
    try {
      const url = new URL($(element).attr('href')!, base);
      url.hash = '';
      if (url.protocol === 'https:' && url.hostname === host) found.push(url.toString());
    } catch {
      // Unparseable hrefs are not candidates.
    }
  });
  const ranked = [...new Set(found)].sort(
    (a, b) => Number(/copyright/i.test(b)) - Number(/copyright/i.test(a)),
  );
  return ranked.slice(0, MAX_CANDIDATES);
}

async function main() {
  const out = argValues('out')[0];
  if (!out) throw new Error('pass --out=<file.json>');
  const only = new Set(argValues('host'));
  const bodies = await getBodies();
  const owners = new Map<string, string[]>();
  for (const body of bodies)
    for (const host of body.hosts) owners.set(host, [...(owners.get(host) ?? []), body.id]);
  const hosts = [...owners.keys()].filter((host) => only.size === 0 || only.has(host));

  const browser = createBrowserFetch();
  const lastRequest = new Map<string, number>();

  async function paced(host: string): Promise<void> {
    const wait = (lastRequest.get(host) ?? 0) + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, Date.now());
  }

  async function get(url: string, host: string): Promise<Outcome> {
    await paced(host);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': COLLECTOR_USER_AGENT, Accept: 'text/html,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const html = await response.text();
      if (response.ok && !looksLikeBotChallenge(html))
        return { kind: 'ok', page: { url: response.url, status: response.status, via: 'http', html } };
      if (response.status === 404) return { kind: 'ok', page: { url, status: 404, via: 'http', html: '' } };
    } catch {
      // Fall through to the browser, which the collector also uses for these hosts.
    }
    await paced(host);
    try {
      const response = await browser.fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
      const html = await response.text();
      if (looksLikeBotChallenge(html)) return { kind: 'refused', detail: 'bot challenge' };
      return { kind: 'ok', page: { url: response.url || url, status: response.status, via: 'browser', html } };
    } catch (error) {
      return { kind: 'refused', detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async function robotsFor(host: string): Promise<{ state: HostReport['robots']; rules: RobotsRules | null }> {
    await paced(host);
    try {
      const response = await fetch(`https://${host}/robots.txt`, {
        headers: { 'User-Agent': COLLECTOR_USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status >= 400 && response.status < 500) return { state: 'absent', rules: null };
      if (!response.ok) return { state: 'unreachable', rules: null };
      const rules = parseRobots(await response.text(), COLLECTOR_IDENTITY_TOKEN.split('/')[0]);
      return { state: 'parsed', rules };
    } catch {
      return { state: 'unreachable', rules: null };
    }
  }

  const reports: HostReport[] = [];
  try {
    for (const host of hosts) {
      const checkedAt = new Date().toISOString();
      const robots = await robotsFor(host);
      const allowed = (url: string) => !robots.rules || robotsAllows(robots.rules, new URL(url));
      const homeUrl = `https://${host}/`;
      const report: HostReport = {
        host,
        bodyIds: owners.get(host)!,
        checkedAt,
        robots: robots.state,
        home: { url: homeUrl, status: null },
        candidates: [],
      };
      reports.push(report);
      if (!allowed(homeUrl)) {
        report.home.error = 'robots.txt disallows';
        continue;
      }
      const home = await get(homeUrl, host);
      if (home.kind === 'refused') {
        report.home.error = home.detail;
        continue;
      }
      report.home = { url: home.page.url, status: home.page.status, via: home.page.via };
      let links = candidateLinks(home.page.html, home.page.url, host);
      if (links.length === 0) links = FALLBACK_PATHS.map((path) => `https://${host}${path}`);
      for (const link of links) {
        if (!allowed(link)) {
          report.candidates.push({ url: link, status: null, statements: [], excerpts: [], error: 'robots.txt disallows' });
          continue;
        }
        const outcome = await get(link, host);
        if (outcome.kind === 'refused') {
          report.candidates.push({ url: link, status: null, statements: [], excerpts: [], error: outcome.detail });
          continue;
        }
        const { title, text } = textOf(outcome.page.html);
        report.candidates.push({
          url: outcome.page.url,
          status: outcome.page.status,
          via: outcome.page.via,
          title,
          ...statementsIn(text),
        });
      }
      console.error(
        `${host}: ${report.candidates.filter((candidate) => candidate.statements.length).length}/${report.candidates.length} candidates with statements`,
      );
    }
  } finally {
    await browser.close();
    await writeFile(out, `${JSON.stringify(reports, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
