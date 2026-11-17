import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['AI Ethics: Principles & Practice (2024)', undefined, 'ai-ethics-principles-practice-2024'],
    ['  --Voluntary AI Safety Standard!  ', undefined, 'voluntary-ai-safety-standard'],
    ['a'.repeat(70), undefined, 'a'.repeat(60)],
    ['Policy for the responsible use of AI in government', 48, 'policy-for-the-responsible-use-of-ai-in-governme'],
    ['National framework for AI', 9, 'national-'],
    ['Stratégie numérique', undefined, 'strat-gie-num-rique'],
    ['!!!', undefined, ''],
  ])('slugify(%j, %j) is %j', (value, maxLength, expected) => {
    expect(slugify(value, maxLength)).toBe(expected);
  });
});
