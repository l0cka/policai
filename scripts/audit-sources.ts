/**
 * Read-only health audit for the official source catalogue.
 *
 * Usage:
 *   npm run audit:sources
 *   npm run audit:sources -- --include-manual
 *   npm run audit:sources -- --source=dta-media
 *   npm run audit:sources -- --json
 */

import {
  extractFromHtml,
  extractFromRss,
} from '../src/lib/pipeline/extract';
import { extractRetrievedDocument } from '../src/lib/pipeline/content';
import {
  createBrowserFetch,
  type BrowserFetch,
} from '../src/lib/pipeline/browser-fetch';
import { retrieveSource } from '../src/lib/pipeline/fetch';
import {
  getAutomaticSources,
  getManualSources,
  getSourceById,
  type WatchSource,
} from '../src/lib/pipeline/sources';

interface AuditOptions {
  sourceId?: string;
  json: boolean;
  includeManual: boolean;
}

interface SourceAuditResult {
  sourceId: string;
  sourceName: string;
  kind: WatchSource['kind'];
  url: string;
  critical: boolean;
  automation: WatchSource['automation'];
  ok: boolean;
  durationMs: number;
  itemCount: number | null;
  candidateCount: number;
  finalUrl?: string;
  contentType?: string;
  contentHash?: string;
  error?: string;
}

function parseArgs(argv: string[]): AuditOptions {
  const options: AuditOptions = { json: false, includeManual: false };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--include-manual') options.includeManual = true;
    else if (arg.startsWith('--source=')) options.sourceId = arg.slice(9);
  }
  return options;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await run(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

async function createOptionalBrowserFetch(): Promise<BrowserFetch | null> {
  try {
    await import('playwright-core');
    return createBrowserFetch();
  } catch {
    console.warn(
      '[audit:sources] playwright-core unavailable — browser retrieval disabled.',
    );
    return null;
  }
}

async function auditSource(
  source: WatchSource,
  browserFetchImpl?: typeof fetch,
): Promise<SourceAuditResult> {
  const startedAt = Date.now();
  try {
    const attempt = async (
      fetchImpl: typeof fetch | undefined,
      timeoutMs: number,
    ) => {
      const retrieved = await retrieveSource(source.url, {
        attempts: 1,
        timeoutMs,
        fetchImpl,
        hashLinkedDocuments: source.kind === 'document',
      });
      let extraction: { itemCount: number; candidates: unknown[] };
      if (source.kind === 'rss') {
        extraction = extractFromRss(retrieved.body, source.url);
      } else if (source.kind === 'html-index') {
        extraction = extractFromHtml(retrieved.body, source.url);
      } else {
        await extractRetrievedDocument(
          retrieved,
          source.url,
          source.name,
        );
        extraction = { itemCount: 1, candidates: [] };
      }
      return { retrieved, extraction };
    };

    const preferBrowser =
      source.fetchStrategy === 'browser' && Boolean(browserFetchImpl);
    let result;
    if (preferBrowser) {
      result = await attempt(browserFetchImpl, 60_000);
    } else {
      try {
        result = await attempt(undefined, 15_000);
        if (result.extraction.itemCount === 0 && browserFetchImpl) {
          result = await attempt(browserFetchImpl, 60_000);
        }
      } catch (error) {
        if (!browserFetchImpl) throw error;
        result = await attempt(browserFetchImpl, 60_000);
      }
    }
    const { retrieved, extraction } = result;
    if (extraction.itemCount === 0) {
      throw new Error('Source returned no extractable index or feed items');
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      kind: source.kind,
      url: source.url,
      critical: source.critical ?? false,
      automation: source.automation,
      ok: true,
      durationMs: Date.now() - startedAt,
      itemCount: extraction.itemCount,
      candidateCount: extraction.candidates.length,
      finalUrl: retrieved.evidence.finalUrl,
      contentType: retrieved.evidence.contentType,
      contentHash: retrieved.evidence.contentHash,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      kind: source.kind,
      url: source.url,
      critical: source.critical ?? false,
      automation: source.automation,
      ok: false,
      durationMs: Date.now() - startedAt,
      itemCount: null,
      candidateCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let sources = options.includeManual
    ? [...getAutomaticSources(), ...getManualSources()]
    : getAutomaticSources();
  if (options.sourceId) {
    const source = getSourceById(options.sourceId);
    if (!source) {
      throw new Error(`Unknown source id: ${options.sourceId}`);
    }
    sources = [source];
  }

  const browserFetch = await createOptionalBrowserFetch();
  let results: SourceAuditResult[];
  try {
    results = await mapWithConcurrency(sources, 4, (source) =>
      auditSource(source, browserFetch?.fetchImpl),
    );
  } finally {
    await browserFetch?.close();
  }
  const successes = results.filter((result) => result.ok).length;
  const failures = results.length - successes;
  const successRate = results.length === 0 ? 1 : successes / results.length;
  const criticalFailures = results.filter(
    (result) => result.critical && !result.ok,
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          auditedAt: new Date().toISOString(),
          successes,
          failures,
          successRate,
          criticalFailures: criticalFailures.map((result) => result.sourceId),
          results,
        },
        null,
        2,
      ),
    );
  } else {
    for (const result of results) {
      const outcome = result.ok ? 'OK  ' : 'FAIL';
      const detail = result.ok
        ? `${result.itemCount} items, ${result.candidateCount} AI-policy candidates, ${result.durationMs}ms`
        : result.error;
      console.log(`${outcome} ${result.sourceId}: ${detail}`);
    }
    console.log(
      `audit-sources: ${successes}/${results.length} sources reachable (${Math.round(
        successRate * 100,
      )}%), ${failures} failed${options.includeManual ? ' (automatic + manual catalogue)' : ' (automatic catalogue)'}`,
    );
  }

  if (successRate < 0.8 || criticalFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('audit-sources: fatal', error);
  process.exitCode = 1;
});
