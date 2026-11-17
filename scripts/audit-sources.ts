import { cliRun, parseCli } from '../src/lib/cli-args';
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
  identityAuthorityFor,
  resolveSourceIdentity,
  type IdentityExceptionState,
} from '../src/lib/pipeline/identity';
import {
  getAutomaticSources,
  getManualSources,
  getSourceById,
  type WatchSource,
} from '../src/lib/pipeline/sources';

const FLAGS = {
  source: { type: 'string', value: '<id>', help: 'audit one source from the catalogue' },
  'include-manual': { type: 'boolean', help: 'also attempt the manually tracked sources' },
  json: { type: 'boolean', help: 'print the report as JSON' },
} as const;

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
  identityException?: Exclude<IdentityExceptionState, 'none'>;
  identityNote?: string;
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
  browserFetchImpl: typeof fetch | undefined,
  now: Date,
): Promise<SourceAuditResult> {
  const startedAt = Date.now();
  const { state, note } = resolveSourceIdentity(source, now);
  const identityFields =
    state === 'none' || note === null
      ? {}
      : { identityException: state, identityNote: note };
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
        identityAuthority: identityAuthorityFor(source),
      });
      let extraction: {
        itemCount: number;
        candidates: unknown[];
        feedValid?: boolean;
      };
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
        const minimumItemCount =
          source.minimumItemCount ??
          (result.extraction.feedValid ? 0 : 1);
        if (
          result.extraction.itemCount < minimumItemCount &&
          browserFetchImpl
        ) {
          result = await attempt(browserFetchImpl, 60_000);
        }
      } catch (error) {
        if (!browserFetchImpl) throw error;
        result = await attempt(browserFetchImpl, 60_000);
      }
    }
    const { retrieved, extraction } = result;
    const minimumItemCount =
      source.minimumItemCount ?? (extraction.feedValid ? 0 : 1);
    if (extraction.itemCount < minimumItemCount) {
      throw new Error(
        minimumItemCount === 1
          ? 'Source returned no usable index or feed items'
          : `Source returned ${extraction.itemCount} usable items; at least ${minimumItemCount} are required`,
      );
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
      ...identityFields,
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
      ...identityFields,
    };
  }
}

async function main() {
  const { values } = cliRun(parseCli('npm run audit:sources --', FLAGS, process.argv.slice(2)));
  const options = { sourceId: values.source, json: values.json, includeManual: values['include-manual'] };
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
  const now = new Date();
  let results: SourceAuditResult[];
  try {
    results = await mapWithConcurrency(sources, 4, (source) =>
      auditSource(source, browserFetch?.fetchImpl, now),
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
      const identityNote = result.identityNote ? ` [${result.identityNote}]` : '';
      console.log(`${outcome} ${result.sourceId}: ${detail}${identityNote}`);
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
