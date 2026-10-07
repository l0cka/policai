/* @vitest-environment node */
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  sources: [] as Array<Record<string, unknown>>,
  retrieve: vi.fn(), browser: vi.fn(), close: vi.fn(),
  extract: vi.fn(),
}));
vi.mock('./pipeline/sources', async (importOriginal) => ({
  ...await importOriginal<typeof import('./pipeline/sources')>(),
  getAutomaticSources: () => fixture.sources,
  getManualSources: () => [],
  getSourceById: (id: string) => fixture.sources.find(s => s.id === id),
}));
vi.mock('./pipeline/browser-fetch', () => ({
  createBrowserFetch: () => ({ fetchImpl: fixture.browser, close: fixture.close }),
}));
vi.mock('./pipeline/fetch', () => ({ retrieveSource: fixture.retrieve }));
vi.mock('./pipeline/extract', () => ({ extractFromHtml: fixture.extract, extractFromRss: fixture.extract }));
vi.mock('./pipeline/content', () => ({ extractRetrievedDocument: vi.fn() }));
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); process.exitCode = 0;
});

for (const json of [false, true]) {
  for (const state of ['active', 'expired', 'none'] as const) {
    for (const outcome of ['success', 'failure', 'fallback', 'empty-fallback'] as const) {
      it(`audit CLI: ${state}, ${json ? 'JSON' : 'text'}, ${outcome}`, async () => {
        vi.resetModules();
        fixture.retrieve.mockReset(); fixture.close.mockReset(); fixture.extract.mockReset();
        fixture.sources = [{
          id: 'industry-ai-publications', name: 'Fixture', url: 'https://www.industry.gov.au/publications?pub-topic=2963',
          kind: 'html-index', enabled: true, automation: 'automatic',
          fetchStrategy: outcome.includes('fallback') ? 'http' : 'browser',
          ...(state === 'none' ? {} : { identityException: { until: '2026-10-21', reason: 'fixture' } }),
        }];
        fixture.extract.mockReturnValue({ itemCount: 1, candidates: [] });
        fixture.retrieve.mockResolvedValue({ body: 'synthetic', evidence: { finalUrl: fixture.sources[0].url, contentType: 'text/html', contentHash: 'hash' } });
        if (outcome === 'failure') fixture.retrieve.mockRejectedValue(new Error('offline refusal'));
        if (outcome === 'fallback') fixture.retrieve.mockRejectedValueOnce(new Error('offline HTTP failure'));
        if (outcome === 'empty-fallback') fixture.extract.mockReturnValueOnce({ itemCount: 0, candidates: [] });
        vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'audit-sources.ts', ...(json ? ['--json'] : [])]);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(state === 'expired' ? '2026-10-20T13:00:00.000Z' : '2026-10-20T12:59:00.000Z'));
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        await import('../../scripts/audit-sources');
        await vi.waitFor(() => expect(output).toHaveBeenCalled());
        expect(fixture.retrieve).toHaveBeenLastCalledWith(fixture.sources[0].url, expect.objectContaining({
          fetchImpl: fixture.browser, attempts: 1,
          identityAuthority: state === 'none' ? undefined : {
            sourceId: 'industry-ai-publications', sourceUrl: fixture.sources[0].url, until: '2026-10-21',
          },
        }));
        expect(fixture.retrieve).toHaveBeenCalledTimes(outcome.includes('fallback') ? 2 : 1);
        expect(fixture.close).toHaveBeenCalledOnce();
        const lines = output.mock.calls.map(call => String(call[0]));
        if (json) {
          const payload = JSON.parse(lines[0]);
          const result = payload.results[0];
          expect(result.identityException).toBe(state === 'none' ? undefined : state);
          if (state !== 'none') expect(result.identityNote).toContain(`identity exception ${state}`);
          expect(result.ok).toBe(outcome !== 'failure');
          expect(payload.failures).toBe(outcome === 'failure' ? 1 : 0);
        } else {
          expect(lines[0]).toMatch(outcome === 'failure' ? /^FAIL / : /^OK /);
          if (state === 'none') expect(lines[0]).not.toContain('identity exception');
          else expect(lines[0]).toContain(`identity exception ${state}`);
        }
        expect(process.exitCode ?? 0).toBe(outcome === 'failure' ? 1 : 0);
      });
    }
  }
}
