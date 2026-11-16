import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceState, StatusPill } from './policy-indicators';

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

describe('StatusPill', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-09-30T13:59:59Z', 'Active·Not yet in effect'],
    ['2026-09-30T14:00:00Z', 'Active'],
  ])('measures commencement on 1 October against the Sydney day at %s', (instant, text) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instant));
    const { container } = render(
      <StatusPill status="active" dates={[{ type: 'commenced', date: '2026-10-01', precision: 'day' }]} />,
    );
    expect(container.textContent).toBe(text);
  });
});
