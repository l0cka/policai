import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CitedInAnalysis, type CitingArticle } from './cited-in-analysis';

function article(overrides: Partial<CitingArticle> = {}): CitingArticle {
  return {
    slug: 'note-1',
    title: 'Instrument note about this record',
    type: 'instrument_note',
    publishedAt: '2026-10-19',
    ...overrides,
  };
}

describe('CitedInAnalysis', () => {
  it('shows a quiet empty state when no piece cites the record', () => {
    render(<CitedInAnalysis articles={[]} />);
    expect(screen.getByRole('heading', { name: 'Analysis citing this record' })).toBeInTheDocument();
    expect(screen.getByText('No published analysis cites this record yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('links each citing piece under the Analysis tier label', () => {
    render(
      <CitedInAnalysis
        articles={[
          article(),
          article({
            slug: 'explainer-1',
            title: 'Broader explainer',
            type: 'explainer',
            publishedAt: '2026-10-17',
          }),
        ]}
      />,
    );
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Instrument note about this record' })).toHaveAttribute(
      'href',
      '/analysis/note-1',
    );
    expect(screen.getByRole('link', { name: 'Broader explainer' })).toHaveAttribute(
      'href',
      '/analysis/explainer-1',
    );
    expect(screen.getAllByText('Analysis')).toHaveLength(2);
  });

  it('server-renders every citing link without client script', () => {
    const html = renderToStaticMarkup(
      <CitedInAnalysis articles={[article(), article({ slug: 'weekly-1', title: 'Weekly', type: 'weekly_briefing' })]} />,
    );
    expect(html).toContain('href="/analysis/note-1"');
    expect(html).toContain('href="/analysis/weekly-1"');
    expect(html).toContain('Analysis citing this record');
  });
});
