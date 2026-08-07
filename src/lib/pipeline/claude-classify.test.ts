import { describe, expect, it, vi } from 'vitest';

vi.mock('./claude-cli', () => ({
  runClaude: vi.fn(),
}));

import { CLAUDE_BATCH_SIZE, classifyBatch } from './claude-classify';
import * as claudeCliModule from './claude-cli';

const runClaude = vi.mocked(claudeCliModule.runClaude);

const candidate = (id: string) => ({
  id, title: `title ${id}`, sourceName: 'aph.gov.au', excerpt: 'excerpt',
});

describe('classifyBatch', () => {
  it('returns one validated verdict per candidate', async () => {
    runClaude.mockResolvedValueOnce(JSON.stringify([
      { id: 'a', relevant: true, confidence: 0.9, jurisdiction: 'federal', type: 'guideline', summary: 'x' },
    ]));
    const verdicts = await classifyBatch([candidate('a')]);
    expect(verdicts).toEqual([{
      id: 'a', relevant: true, confidence: 0.9,
      jurisdiction: 'federal', type: 'guideline', summary: 'x',
    }]);
  });

  it('tolerates prose around the JSON array', async () => {
    runClaude.mockResolvedValueOnce(
      'Here you go:\n[{"id":"a","relevant":false,"confidence":0.2,"jurisdiction":null,"type":null,"summary":"s"}]\nDone.',
    );
    const verdicts = await classifyBatch([candidate('a')]);
    expect(verdicts[0].relevant).toBe(false);
  });

  it('drops malformed entries rather than corrupting the batch', async () => {
    runClaude.mockResolvedValueOnce(JSON.stringify([
      { id: 'a', relevant: true, confidence: 0.9, jurisdiction: null, type: null, summary: 'ok' },
      { id: 'b', relevant: 'yes', confidence: 2 },
    ]));
    const verdicts = await classifyBatch([candidate('a'), candidate('b')]);
    expect(verdicts.map((v) => v.id)).toEqual(['a']);
  });

  it('returns an empty array without invoking Claude when there are no candidates', async () => {
    runClaude.mockClear();
    expect(await classifyBatch([])).toEqual([]);
    expect(runClaude).not.toHaveBeenCalled();
  });

  it('chunks large inputs into multiple invocations', async () => {
    runClaude.mockClear();
    runClaude.mockResolvedValue('[]');
    const many = Array.from({ length: CLAUDE_BATCH_SIZE + 1 }, (_, i) => candidate(String(i)));
    await classifyBatch(many);
    expect(runClaude).toHaveBeenCalledTimes(2);
  });
});
