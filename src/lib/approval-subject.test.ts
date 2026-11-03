import { describe, expect, it } from 'vitest';
import { formatProposalCode } from './approval-subject';

describe('formatProposalCode', () => {
  it('shows 16 hex characters in groups of four', () => {
    expect(formatProposalCode('0123456789abcdef0123456789abcdef')).toBe('0123 4567 89ab cdef');
  });
});
