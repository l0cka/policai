import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CitedInAnalysis } from './cited-in-analysis';

describe('CitedInAnalysis', () => {
  it('renders nothing when no articles cite the record', () => {
    const { container } = render(<CitedInAnalysis articles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists citing analysis with the existing policy-page pattern', () => {
    render(
      <CitedInAnalysis
        articles={[
          {
            slug: 'courts-and-tribunals-ai-rules',
            title: 'How Australian courts and tribunals govern the use of AI',
            type: 'explainer',
            publishedAt: '2026-10-17',
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Analysis citing this record' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'How Australian courts and tribunals govern the use of AI',
      }),
    ).toHaveAttribute('href', '/analysis/courts-and-tribunals-ai-rules');
  });
});
