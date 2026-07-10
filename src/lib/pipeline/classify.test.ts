/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasAiProvider, analyseContentRelevance } = vi.hoisted(() => ({
  hasAiProvider: vi.fn(),
  analyseContentRelevance: vi.fn(),
}));

vi.mock('@/lib/ai-client', () => ({ hasAiProvider }));
vi.mock('@/lib/analysis', () => ({ analyseContentRelevance }));

import { classifyCandidate, heuristicClassification } from './classify';

const CANDIDATE = {
  url: 'https://www.example.gov.au/news/ai-assurance-framework',
  title: 'New AI assurance framework for government agencies',
  text: 'The government released a new artificial intelligence assurance framework.',
  dateHint: '2026-06-15',
};

describe('heuristicClassification', () => {
  it('marks keyword-matched candidates as relevant with capped confidence', () => {
    const result = heuristicClassification(CANDIDATE);
    expect(result.classification).toBe('heuristic');
    expect(result.isRelevant).toBe(true);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(0.5);
    expect(result.relevanceScore).toBeLessThan(0.8);
  });

  it('marks non-matching candidates as irrelevant', () => {
    const result = heuristicClassification({
      url: 'https://www.example.gov.au/news/road-upgrade',
      title: 'Highway upgrade announced',
      text: 'A new highway upgrade for the region.',
    });
    expect(result.isRelevant).toBe(false);
    expect(result.relevanceScore).toBe(0);
  });
});

describe('classifyCandidate', () => {
  beforeEach(() => {
    hasAiProvider.mockReset();
    analyseContentRelevance.mockReset();
  });

  it('uses AI analysis when a provider and page content are available', async () => {
    hasAiProvider.mockReturnValue(true);
    analyseContentRelevance.mockResolvedValue({
      isRelevant: true,
      relevanceScore: 0.9,
      summary: 'A new assurance framework.',
      tags: ['assurance'],
      policyType: 'framework',
      jurisdiction: 'federal',
      agencies: ['DTA'],
      keyDates: [],
      relatedTopics: [],
    });

    const result = await classifyCandidate(CANDIDATE, '<html>page body</html>');

    expect(result.classification).toBe('ai');
    expect(result.relevanceScore).toBe(0.9);
    expect(result.summary).toBe('A new assurance framework.');
    expect(result.suggestedType).toBe('framework');
    expect(result.suggestedJurisdiction).toBe('federal');
  });

  it('falls back to heuristics without a provider', async () => {
    hasAiProvider.mockReturnValue(false);

    const result = await classifyCandidate(CANDIDATE, '<html>page body</html>');

    expect(analyseContentRelevance).not.toHaveBeenCalled();
    expect(result.classification).toBe('heuristic');
    expect(result.isRelevant).toBe(true);
  });

  it('falls back to heuristics when AI analysis throws', async () => {
    hasAiProvider.mockReturnValue(true);
    analyseContentRelevance.mockRejectedValue(new Error('rate limited'));

    const result = await classifyCandidate(CANDIDATE, '<html>page body</html>');

    expect(result.classification).toBe('heuristic');
    expect(result.isRelevant).toBe(true);
  });
});
