/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
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
    expect(result.assessment).toEqual({
      method: 'heuristic',
      promptVersion: 'keyword-rules-v1',
    });
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
  it('always uses deterministic heuristics when page content is available', async () => {
    const result = await classifyCandidate(
      CANDIDATE,
      '<html><body>page content cannot change the classification path</body></html>',
    );

    expect(result.classification).toBe('heuristic');
    expect(result.isRelevant).toBe(true);
    expect(result.relevanceScore).toBe(0.65);
    expect(result.assessment.method).toBe('heuristic');
    expect(result.assessment.provider).toBeUndefined();
    expect(result.assessment.model).toBeUndefined();
  });

  it('uses the same deterministic path without page content', async () => {
    const result = await classifyCandidate(CANDIDATE, null);

    expect(result).toEqual(heuristicClassification(CANDIDATE));
  });
});
