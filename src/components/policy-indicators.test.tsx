import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceState } from './policy-indicators';

describe('SourceState', () => {
  it('labels a current verification as a verified source', () => {
    render(<SourceState verification={{ status: 'verified' }} />);
    expect(screen.getByText('Verified source')).toBeInTheDocument();
  });

  it('labels a lapsed verification as review due, not unverified', () => {
    render(<SourceState verification={{ status: 'stale' }} />);
    expect(screen.getByText('Review due')).toBeInTheDocument();
  });

  it('labels anything else as needing review', () => {
    render(<SourceState verification={{ status: 'needs_review' }} />);
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });
});
