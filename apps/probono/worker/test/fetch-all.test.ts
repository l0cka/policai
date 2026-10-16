import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawItem } from '../src/lib/fetch-firecrawl.js';

const query = vi.fn();
vi.mock('../src/lib/db.js', () => ({
  getPool: () => ({ query }),
  closePool: async () => {},
}));

const { exitCode, ingestSource } = await import('../src/fetch-all.js');

const source = { id: 7, name: 'fixture', url: 'https://fixture.test/feed', fetch_method: 'rss' as const, item_link_pattern: null };
const runStartedAt = '2026-10-16T00:00:00.000Z';
const items = (): RawItem[] => [
  { url: 'https://example.com/a', title: 'A', published_at: null, excerpt: 'Excerpt A' },
  { url: 'https://example.com/b', title: 'B', published_at: null, excerpt: 'Excerpt B' },
];

describe('ingestSource without a database', () => {
  beforeEach(() => query.mockReset());

  it('records a failed run carrying the database error when an insert throws', async () => {
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('INSERT INTO items')) throw new Error('column "content_hash" does not exist');
      return { rowCount: 1, rows: [] };
    });

    const outcome = await ingestSource(source, runStartedAt, async () => items());

    expect(outcome).toMatchObject({
      status: 'failed',
      cause: 'database',
      error: 'column "content_hash" does not exist',
      items_found: 2,
      items_new: 0,
    });
    const runInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO ingest_runs'));
    expect(runInsert?.[0]).toContain("'failed'");
    expect(runInsert?.[1]).toContain('column "content_hash" does not exist');
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO items'))).toHaveLength(1);
  });

  it('skips an item with an unparseable URL and still records ok', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    const raw = [...items(), { url: 'not-a-url', title: 'Bad', published_at: null, excerpt: 'x' }];

    const outcome = await ingestSource(source, runStartedAt, async () => raw);

    expect(outcome).toMatchObject({ status: 'ok', items_found: 3, items_new: 2, error: null });
  });

  it('classifies a fetcher failure as a fetch failure', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [] });

    const outcome = await ingestSource(source, runStartedAt, async () => {
      throw new Error('Feed unreachable');
    });

    expect(outcome).toMatchObject({ status: 'failed', cause: 'fetch', error: 'Feed unreachable' });
  });
});

describe('exitCode', () => {
  const ok = { status: 'ok' as const, source_id: 1, name: 'a', items_found: 1, items_new: 1, error: null };
  const fetchFailed = { status: 'failed' as const, cause: 'fetch' as const, source_id: 2, name: 'b', items_found: 0, items_new: 0, error: 'x' };
  const dbFailed = { ...fetchFailed, cause: 'database' as const };

  it('is 0 when every source is ok', () => expect(exitCode([ok, ok])).toBe(0));
  it('is 0 when only some sources fail to fetch', () => expect(exitCode([ok, fetchFailed])).toBe(0));
  it('is 1 when any source hit a database error', () => expect(exitCode([ok, dbFailed])).toBe(1));
  it('is 1 when every source failed', () => expect(exitCode([fetchFailed, fetchFailed])).toBe(1));
  it('is 0 when there are no sources', () => expect(exitCode([])).toBe(0));
});
