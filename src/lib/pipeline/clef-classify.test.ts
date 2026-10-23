import { describe, expect, it, vi } from 'vitest';
import { clefUnavailableReason, createClefScorer } from './clef-classify';

const item = (id: string) => ({
  id,
  title: `title ${id}`,
  text: 'excerpt',
  sourceName: 'Example',
});

function ollama(routes: Record<string, (body: unknown) => unknown>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const handler = routes[path];
    if (!handler) return new Response('not found', { status: 404 });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    return Response.json(handler(body));
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const answer = (noul: unknown) => ({
  model: 'clef-flash',
  answers: { relevant: { type: 'noul', noul } },
  usage: { input_tokens: 10, output_tokens: 1 },
});

describe('createClefScorer', () => {
  it('asks one local noul question per item and returns its probability', async () => {
    const fetchImpl = ollama({ '/v1/systemone': () => answer(0.83) });
    const scores = await createClefScorer({ fetchImpl })([item('a'), item('b')]);

    expect(scores).toEqual(new Map([['a', 0.83], ['b', 0.83]]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:11434/v1/systemone');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: 'clef-flash',
      questions: { relevant: { type: 'noul' } },
    });
    expect(JSON.parse(body.state)).toEqual({
      title: 'title a',
      source: 'Example',
      excerpt: 'excerpt',
    });
  });

  it('leaves an item unscored when the reply is malformed or the call fails', async () => {
    const replies = [answer(1.4), answer(0.2)];
    const log = vi.fn();
    const fetchImpl = ollama({ '/v1/systemone': () => replies.shift() });
    const scores = await createClefScorer({ fetchImpl, log })([
      item('bad'),
      item('good'),
    ]);

    expect(scores).toEqual(new Map([['good', 0.2]]));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[clef] bad:'));
  });
});

describe('clefUnavailableReason', () => {
  const tags = {
    '/api/ps': () => ({ models: [] }),
    '/api/tags': () => ({ models: [{ name: 'clef-flash:latest' }] }),
    '/v1/systemone': () => answer(0.9),
  };

  it('is ready when the GPU has room and the model is installed', async () => {
    expect(
      await clefUnavailableReason({
        fetchImpl: ollama(tags),
        freeVramMb: async () => 20_000,
      }),
    ).toBeNull();
  });

  it('declines when the GPU is busy, without asking the model', async () => {
    const fetchImpl = ollama(tags);
    expect(
      await clefUnavailableReason({ fetchImpl, freeVramMb: async () => 4_000 }),
    ).toMatch(/free VRAM 4000 MB/);
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/ps',
    ]);
  });

  it('is ready when clef-flash is already loaded, however little VRAM is free', async () => {
    expect(
      await clefUnavailableReason({
        fetchImpl: ollama({
          ...tags,
          '/api/ps': () => ({ models: [{ name: 'clef-flash:latest' }] }),
        }),
        freeVramMb: async () => 8_973,
      }),
    ).toBeNull();
  });

  it('declines when the listed model cannot answer', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      new URL(String(url)).pathname === '/api/ps'
        ? Response.json({ models: [] })
        : new URL(String(url)).pathname === '/api/tags'
        ? Response.json({ models: [{ name: 'clef-flash:latest' }] })
        : new Response(
            JSON.stringify({ error: "'clef-flash:latest' was downloaded in a format that is no longer supported" }),
            { status: 400 },
          ),
    ) as unknown as typeof fetch;
    expect(
      await clefUnavailableReason({ fetchImpl, freeVramMb: async () => 20_000 }),
    ).toMatch(/HTTP 400 from \/v1\/systemone: .*no longer supported/);
  });

  it('declines when the model is missing or Ollama is down', async () => {
    expect(
      await clefUnavailableReason({
        fetchImpl: ollama({
          '/api/ps': () => ({ models: [] }),
          '/api/tags': () => ({ models: [{ name: 'other' }] }),
        }),
        freeVramMb: async () => 20_000,
      }),
    ).toMatch(/not installed/);
    expect(
      await clefUnavailableReason({
        fetchImpl: ollama({}),
        freeVramMb: async () => 20_000,
      }),
    ).toMatch(/HTTP 404/);
  });
});
