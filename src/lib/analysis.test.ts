/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  analyseContentRelevance,
  RELEVANCE_RULESET_VERSION,
  summarizePolicy,
} from './analysis';

describe('deterministic source analysis', () => {
  it('identifies an AI governance document without a provider', async () => {
    const result = await analyseContentRelevance(
      'The South Australian Government has issued guidance for generative AI assurance in the public sector.',
      'https://www.sa.gov.au/guidance/generative-ai',
      'Generative AI assurance guidelines',
    );

    expect(RELEVANCE_RULESET_VERSION).toBe('keyword-rules-v1');
    expect(result).toMatchObject({
      isRelevant: true,
      relevanceScore: 0.65,
      policyType: 'guideline',
      jurisdiction: 'sa',
    });
    expect(result.tags).toContain('generative-ai');
    expect(result.tags).toContain('assurance');
  });

  it('rejects unrelated government content', async () => {
    const result = await analyseContentRelevance(
      'Road resurfacing works will commence next month.',
      'https://www.example.gov.au/news/road-works',
      'Regional road works',
    );

    expect(result.isRelevant).toBe(false);
    expect(result.relevanceScore).toBe(0);
    expect(result.summary).toBe('');
  });

  it('creates an extractive summary locally', async () => {
    const result = await summarizePolicy(
      'AI policy',
      'First key point. Second key point. Third key point.',
    );

    expect(result.summary).toBe(
      'First key point. Second key point. Third key point.',
    );
    expect(result.keyPoints).toEqual([
      'First key point.',
      'Second key point.',
      'Third key point.',
    ]);
  });
});
