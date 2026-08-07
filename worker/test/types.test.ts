import { describe, expect, it } from 'vitest';
import { EnrichmentSchema } from '../src/lib/types.js';

describe('EnrichmentSchema', () => {
  it('accepts a valid enrichment payload', () => {
    const parsed = EnrichmentSchema.parse({
      stream: 'funding',
      relevant: true,
      blurb: 'The Commonwealth opened a new NLAP top-up round for community legal centres.',
      opportunity: true,
      opportunity_reason: 'G+T could assist CLC applicants with grant agreements.',
      entities: {
        organisations: ["Attorney-General's Department"],
        deadlines: [{ date: '2026-09-30', label: 'Applications close' }],
        amounts: ['$12m'],
      },
      excerpt: null,
    });
    expect(parsed.stream).toBe('funding');
  });

  it('rejects an unknown stream, a missing relevant flag, and an over-long excerpt', () => {
    expect(() => EnrichmentSchema.parse({ stream: 'sport', relevant: true, blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: null })).toThrow();
    expect(() => EnrichmentSchema.parse({ stream: 'news', blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: null })).toThrow();
    expect(() => EnrichmentSchema.parse({ stream: 'news', relevant: true, blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: 'x'.repeat(701) })).toThrow();
  });
});
