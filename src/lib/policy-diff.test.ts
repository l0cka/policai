import { describe, expect, it } from 'vitest';
import type { Policy } from '@/types';
import { diffPolicyText, retainedPriorBody } from './policy-diff';
import { policyRevisionHash } from './policy-revision';

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

describe('retainedPriorBody', () => {
  it('returns the one retained body for a record', () => {
    expect(
      retainedPriorBody(
        [{ policyId: 'record-1', content: 'Previous instrument text.' }],
        'record-1',
      ),
    ).toBe('Previous instrument text.');
  });

  it('returns null when the record has no entry, a blank body, or two bodies', () => {
    const entries = [
      { policyId: 'blank', content: '   ' },
      { policyId: 'missing-body' },
      { policyId: 'twice', content: 'First.' },
      { policyId: 'twice', content: 'Second.' },
    ];
    expect(retainedPriorBody(entries, 'absent')).toBeNull();
    expect(retainedPriorBody(entries, 'blank')).toBeNull();
    expect(retainedPriorBody(entries, 'missing-body')).toBeNull();
    expect(retainedPriorBody(entries, 'twice')).toBeNull();
  });

  it('keeps policyRevisionHash inputs free of prior text', () => {
    const policy = {
      id: 'record-1',
      content: 'Current body.',
      dates: [],
      verification: { status: 'verified', source: { url: 'https://example.gov.au/policy' } },
    } as Policy;
    const hashed = policyRevisionHash(policy);
    expect(retainedPriorBody([{ policyId: policy.id, content: 'Old body.' }], policy.id)).toBe(
      'Old body.',
    );
    expect(policyRevisionHash(policy)).toBe(hashed);
    expect(policyRevisionHash({ ...policy, priorContent: 'Old body.' } as Policy)).not.toBe(hashed);
  });
});
