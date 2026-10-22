/**
 * Site reuse survey: for each host in data/bodies.json, finds the site's
 * copyright or licence page and reports the licence statements on it, as
 * evidence for an editor to record in data/site-reuse.json. It never writes
 * that file.
 *
 * Every request goes through the host gate (declared identity, robots.txt,
 * crawl-delay, Retry-After, decided blocks) and the official-host allow-list,
 * over plain HTTP, then Firecrawl, then the collector's browser, in the
 * collector's order, all with the same declared identity. A page none of
 * them can fetch is reported as refused.
 *
 * Usage:
 *   npm run survey:site-reuse -- --out=<file.json> [--host=<host>]...
 */

import { writeFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { getBodies } from '../src/lib/data-service';
import { createBrowserFetch } from '../src/lib/pipeline/browser-fetch';
import { isGateError, retrieveSource, SourceFetchError } from '../src/lib/pipeline/fetch';
import { scrapeWithFirecrawl } from '../src/lib/pipeline/firecrawl';
import { createHostGate, robotsFetcher } from '../src/lib/pipeline/host-gate';
import { refusedHosts, WATCH_SOURCES } from '../src/lib/pipeline/sources';

const TIMEOUT_MS = 60_000;
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

type Via = 'http' | 'firecrawl' | 'browser';

interface Page {
  url: string;
  via: Via;
  html: string;
}

type Outcome =
  | { kind: 'ok'; page: Page }
  | { kind: 'refused'; detail: string };

interface CandidateReport {
  url: string;
  via?: Via;
  title?: string;
  statements: string[];
  excerpts: string[];
  error?: string;
}

interface HostReport {
  host: string;
  bodyIds: string[];
  checkedAt: string;
  home: { url: string; via?: Via; error?: string };
  candidates: CandidateReport[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  const gate = createHostGate({
    hosts: {},
    refused: refusedHosts(WATCH_SOURCES),
    fetchRobots: robotsFetcher({ browserFetchImpl: browser.fetchImpl }),
    now: Date.now,
    sleep,
  });

  async function get(url: string): Promise<Outcome> {
    const options = { gate, attempts: 1, timeoutMs: TIMEOUT_MS, hashLinkedDocuments: false };
    try {
      const retrieved = await retrieveSource(url, options);
      return { kind: 'ok', page: { url: retrieved.evidence.finalUrl ?? url, via: 'http', html: retrieved.body } };
    } catch (error) {
      const futile =
        error instanceof SourceFetchError &&
        (error.code === 'destination_mismatch' || error.status === 404 || isGateError(error));
      if (futile) return { kind: 'refused', detail: message(error) };
    }
    try {
      const scraped = await scrapeWithFirecrawl(url, { gate });
      if (scraped.ok) return { kind: 'ok', page: { url: scraped.finalUrl, via: 'firecrawl', html: scraped.rawHtml } };
    } catch (error) {
      if (isGateError(error)) return { kind: 'refused', detail: message(error) };
    }
    try {
      const retrieved = await retrieveSource(url, {
        ...options,
        fetchImpl: browser.fetchImpl,
        timeoutMs: TIMEOUT_MS * 2,
        transport: 'browser',
      });
      return { kind: 'ok', page: { url: retrieved.evidence.finalUrl ?? url, via: 'browser', html: retrieved.body } };
    } catch (error) {
      return { kind: 'refused', detail: message(error) };
    }
  }

  const reports: HostReport[] = [];
  try {
    for (const host of hosts) {
      const homeUrl = `https://${host}/`;
      const report: HostReport = {
        host,
        bodyIds: owners.get(host)!,
        checkedAt: new Date().toISOString(),
        home: { url: homeUrl },
        candidates: [],
      };
      reports.push(report);
      const home = await get(homeUrl);
      if (home.kind === 'refused') {
        report.home.error = home.detail;
        continue;
      }
      report.home = { url: home.page.url, via: home.page.via };
      let links = candidateLinks(home.page.html, home.page.url, host);
      if (links.length === 0) links = FALLBACK_PATHS.map((path) => `https://${host}${path}`);
      for (const link of links) {
        const outcome = await get(link);
        if (outcome.kind === 'refused') {
          report.candidates.push({ url: link, statements: [], excerpts: [], error: outcome.detail });
          continue;
        }
        const { title, text } = textOf(outcome.page.html);
        report.candidates.push({ url: outcome.page.url, via: outcome.page.via, title, ...statementsIn(text) });
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
