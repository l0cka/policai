import {
  foldLinkedDocuments,
  isGateError,
  retrieveSource,
  SourceFetchError,
  type RetrievedSource,
} from './fetch';
import { extractFromFrlSearch } from '@/lib/legislation/frl-search';
import { extractFromSaltSearch } from '@/lib/legislation/sa-salt';
import { extractFromBillList } from '@/lib/legislation/state-bill-lists';
import { extractFromVicBillSearch } from '@/lib/legislation/vic-bills';
import { extractFromHtml, extractFromRss } from './extract';
import { scrapeWithFirecrawl } from './firecrawl';
import type { HostGate } from './host-gate';
import { identityAuthorityFor } from './identity';
import type { WatchSource } from './sources';

/** Browser retrieval covers cold start plus challenge settling. */
const BROWSER_RETRIEVAL_TIMEOUT_MS = 60_000;

/** Allow-list and homepage-redirect failures are not client-dependent. */
export function isBrowserFallbackFutile(error: unknown): boolean {
  return (
    error instanceof SourceFetchError &&
    (error.code === 'destination_mismatch' || isGateError(error))
  );
}

export async function retrievedSourceFromFirecrawl(
  body: string,
  requestedUrl: string,
  finalUrl: string,
  now: () => Date,
  contentType = 'text/plain; charset=utf-8',
): Promise<RetrievedSource> {
  const replayFetch: typeof fetch = async () => {
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': contentType },
    });
    Object.defineProperty(response, 'url', { value: finalUrl });
    return response;
  };
  return retrieveSource(requestedUrl, { fetchImpl: replayFetch, now });
}

export interface RetrievalLadderOptions {
  source: WatchSource;
  now: Date;
  gate: HostGate;
  fetchImpl?: typeof fetch;
  browserFetchImpl?: typeof fetch;
  log: (message: string) => void;
}

/**
 * One source's way to its pages: plain HTTP, then Firecrawl, then the
 * browser, with the same identity and host gate on every rung. `index` reads
 * the source's own page and extracts its items; `page` reads a candidate.
 */
export function retrievalLadder({
  source,
  now,
  gate,
  fetchImpl,
  browserFetchImpl,
  log,
}: RetrievalLadderOptions) {
  const preferBrowser =
    source.fetchStrategy === 'browser' && Boolean(browserFetchImpl);
  const identityAuthority = identityAuthorityFor(source);
  const indexGate: HostGate = { ...gate, admit: (url) => gate.admit(url, 'wait') };

  const retrievePageWithFallback = async (
    url: string,
  ): Promise<RetrievedSource> => {
    if (preferBrowser) {
      const firecrawled = source.identityException
        ? { ok: false as const, reason: 'identity_scope' }
        : await scrapeWithFirecrawl(url, { identity: 'declared', gate });
      if (firecrawled.ok) {
        const page = await retrievedSourceFromFirecrawl(
          firecrawled.markdown,
          url,
          firecrawled.finalUrl,
          () => now,
        );
        try {
          return await foldLinkedDocuments(page, firecrawled.rawHtml, url, {
            fetchImpl,
            now: () => now,
            identityAuthority,
            gate,
          });
        } catch (error) {
          if (isBrowserFallbackFutile(error)) throw error;
          log(
            `[collect] ${source.id}: linked documents of Firecrawl page ${url} failed over HTTP (${error instanceof Error ? error.message : String(error)}), retrying with the browser retriever`,
          );
        }
      } else {
        log(
          `[collect] ${source.id}: Firecrawl unavailable for ${url} (${firecrawled.reason}), retrying with the browser retriever`,
        );
      }
      return retrieveSource(url, {
        fetchImpl: browserFetchImpl,
        now: () => now,
        timeoutMs: BROWSER_RETRIEVAL_TIMEOUT_MS,
        identityAuthority,
        gate,
        transport: 'browser',
      });
    }
    try {
      return await retrieveSource(url, { fetchImpl, now: () => now, identityAuthority, gate });
    } catch (error) {
      if (!browserFetchImpl || isBrowserFallbackFutile(error)) throw error;
      log(`[collect] ${source.id}: retrying ${url} with the browser retriever`);
      return retrieveSource(url, {
        fetchImpl: browserFetchImpl,
        now: () => now,
        timeoutMs: BROWSER_RETRIEVAL_TIMEOUT_MS,
        identityAuthority,
        gate,
        transport: 'browser',
      });
    }
  };

  const attemptIndexRetrieval = async (
    impl: typeof fetch | undefined,
    timeoutMs?: number,
  ) => {
    const retrieval = await retrieveSource(source.url, {
      fetchImpl: impl,
      now: () => now,
      hashLinkedDocuments: source.kind === 'document',
      identityAuthority,
      gate: indexGate,
      ...(timeoutMs !== undefined ? { timeoutMs, transport: 'browser' as const } : {}),
    });
    const extracted =
      source.kind === 'document'
        ? null
        : source.kind === 'rss'
          ? extractFromRss(retrieval.body, source.url, {
              titlePattern: source.bodyRelevance?.titlePattern,
            })
          : source.kind === 'frl-search'
            ? extractFromFrlSearch(retrieval.body)
            : source.kind === 'sa-salt-search'
              ? extractFromSaltSearch(retrieval.body)
              : source.kind === 'vic-bill-search'
                ? extractFromVicBillSearch(retrieval.body)
                : source.kind === 'bill-list' && source.billList
                  ? extractFromBillList(source.billList, retrieval.body, source.url)
                  : extractFromHtml(retrieval.body, source.url);
    return { retrieval, extracted };
  };
  // Index pages climb the same ladder as candidate pages: Firecrawl, still
  // declaring the Policai identity, reaches GovCMS hosts that reset the
  // browser. Only html-index pages: a document's hash and a feed's XML
  // would change with the renderer.
  const firecrawlIndex = async () => {
    if (source.kind !== 'html-index' || source.identityException) return null;
    const firecrawled = await scrapeWithFirecrawl(source.url, {
      identity: 'declared',
      gate: indexGate,
    });
    if (!firecrawled.ok) {
      log(
        `[collect] ${source.id}: Firecrawl unavailable for the index (${firecrawled.reason}), retrying with the browser retriever`,
      );
      return null;
    }
    const retrieval = await retrievedSourceFromFirecrawl(
      firecrawled.rawHtml,
      source.url,
      firecrawled.finalUrl,
      () => now,
      'text/html; charset=utf-8',
    );
    const extracted = extractFromHtml(retrieval.body, source.url);
    if (extracted.itemCount === 0) {
      log(
        `[collect] ${source.id}: empty Firecrawl index, retrying with the browser retriever`,
      );
      return null;
    }
    return { retrieval, extracted };
  };
  const browserIndex = async () =>
    (await firecrawlIndex()) ??
    attemptIndexRetrieval(browserFetchImpl, BROWSER_RETRIEVAL_TIMEOUT_MS);
  const retrieveSourceIndex = async () => {
    if (preferBrowser) return browserIndex();
    try {
      const indexAttempt = await attemptIndexRetrieval(fetchImpl);
      if (
        browserFetchImpl &&
        indexAttempt.extracted?.itemCount === 0 &&
        !indexAttempt.extracted.feedValid
      ) {
        log(
          `[collect] ${source.id}: empty index, retrying with the browser retriever`,
        );
        return await browserIndex();
      }
      return indexAttempt;
    } catch (error) {
      if (!browserFetchImpl || isBrowserFallbackFutile(error)) {
        throw error;
      }
      log(
        `[collect] ${source.id}: retrying source with the browser retriever`,
      );
      return browserIndex();
    }
  };

  return { page: retrievePageWithFallback, index: retrieveSourceIndex };
}
