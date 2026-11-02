import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisTypeFilter } from './analysis-type-filter';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));

describe('AnalysisTypeFilter', () => {
  beforeEach(() => { query = ''; });

  it('shows every article when no format is chosen', () => {
    const { container } = render(<AnalysisTypeFilter publishedTypes={['explainer']} />);
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector('style')).toBeNull();
  });

  it('hides articles of other formats for ?type=', () => {
    query = 'type=explainer';
    const { container } = render(<AnalysisTypeFilter publishedTypes={['explainer']} />);
    expect(screen.getByRole('link', { name: 'Explainer' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector('style')?.textContent).toBe(
      '[data-article-type]:not([data-article-type="explainer"]){display:none}',
    );
    expect(screen.queryByText(/No published/)).toBeNull();
  });

  it('says so when a format has no published articles', () => {
    query = 'type=weekly_briefing';
    render(<AnalysisTypeFilter publishedTypes={['explainer']} />);
    expect(screen.getByText(/No published .* yet/)).toBeInTheDocument();
  });

  it('ignores an unknown format', () => {
    query = 'type=%22%5D%7Bx';
    const { container } = render(<AnalysisTypeFilter publishedTypes={['explainer']} />);
    expect(container.querySelector('style')).toBeNull();
  });
});
