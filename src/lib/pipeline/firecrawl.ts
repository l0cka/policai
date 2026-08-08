/**
 * Client for the self-hosted Firecrawl stack on the collection host.
 *
 * The stack is demand-started: `firecrawl-proxy.socket` listens on 3003 and
 * wakes the compose stack on first connection, and an idle timer stops it
 * again. Port 3002 is the raw API and is down whenever the stack sleeps, so
 * this client must always address 3003 — calling 3002 directly produces
 * connection refusals that look like source outages.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:3003';

/** Cold start after idle was measured at ~17.5s, so the first call gets room. */
const COLD_START_TIMEOUT_MS = 90_000;
const WARM_TIMEOUT_MS = 45_000;

let hasCompletedACall = false;

export interface FirecrawlOptions {
  timeoutMs?: number;
}

export type FirecrawlResult =
  | { ok: true; markdown: string; title: string | null; sourceUrl: string }
  | {
      ok: false;
      reason: 'timeout' | 'unavailable' | 'http_error' | 'empty';
      detail: string;
    };

export function firecrawlBaseUrl(): string {
  return (process.env.FIRECRAWL_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Resets the cold-start latch. Tests only. */
export function resetFirecrawlWarmup(): void {
  hasCompletedACall = false;
}

export async function scrapeWithFirecrawl(
  url: string,
  options: FirecrawlOptions = {},
): Promise<FirecrawlResult> {
  const timeoutMs =
    options.timeoutMs ??
    (hasCompletedACall ? WARM_TIMEOUT_MS : COLD_START_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${firecrawlBaseUrl()}/v2/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: 'http_error',
        detail: `firecrawl responded ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      success?: boolean;
      data?: { markdown?: string; metadata?: { title?: string } };
    };
    const markdown = payload.data?.markdown?.trim() ?? '';

    if (!payload.success || markdown.length === 0) {
      return { ok: false, reason: 'empty', detail: 'no markdown returned' };
    }

    hasCompletedACall = true;
    return {
      ok: true,
      markdown,
      title: payload.data?.metadata?.title ?? null,
      sourceUrl: url,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: aborted ? 'timeout' : 'unavailable',
      detail,
    };
  } finally {
    clearTimeout(timer);
  }
}
