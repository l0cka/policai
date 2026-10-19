import { describe, expect, it } from 'vitest';
import { diffPolicyText } from './policy-diff';

describe('diffPolicyText', () => {
  it('returns an added line and keeps the shared line', () => {
    const diff = diffPolicyText(
      'Keep this line.',
      'Keep this line.\nA new sentence was added.',
    );
    expect(diff.added).toEqual(['A new sentence was added.']);
    expect(diff.removed).toEqual([]);
  });

  it('returns a removed line and keeps the shared line', () => {
    const diff = diffPolicyText(
      'Keep this line.\nA sentence was removed.',
      'Keep this line.',
    );
    expect(diff.removed).toEqual(['A sentence was removed.']);
    expect(diff.added).toEqual([]);
  });

  it('returns no lines when the two bodies are identical', () => {
    const body = 'The same instrument text.\nStill the same.';
    expect(diffPolicyText(body, body)).toEqual({ added: [], removed: [] });
  });

  it('reports a replaced line as one removal and one addition', () => {
    const diff = diffPolicyText(
      'Same.\nOld sentence.\nTail.',
      'Same.\nNew sentence.\nTail.',
    );
    expect(diff.removed).toEqual(['Old sentence.']);
    expect(diff.added).toEqual(['New sentence.']);
  });
});
