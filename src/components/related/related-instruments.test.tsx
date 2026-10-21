import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RelatedInstrument } from '@/lib/related-policies';
import { RelatedInstruments } from './related-instruments';

function items(count: number): RelatedInstrument[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    title: `Record ${index}`,
    jurisdiction: 'federal',
    type: 'guideline',
    sharedThemes: ['Generative AI', 'Courts and tribunals'],
  }));
}

describe('RelatedInstruments', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<RelatedInstruments items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows up to eight linked items with their shared themes and no expander at eight', () => {
    render(<RelatedInstruments items={items(8)} />);
    expect(screen.getByRole('heading', { name: 'Related instruments' })).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByRole('link', { name: 'Record 0' })).toHaveAttribute('href', '/policies/r0');
    expect(screen.getAllByText('Shares: Generative AI, Courts and tribunals')).toHaveLength(8);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('caps at eight, counts the total from data, and expands in place keeping focus', () => {
    render(<RelatedInstruments items={items(11)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    const button = screen.getByRole('button', { name: 'Show all 11 related' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    button.focus();
    fireEvent.click(button);
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveFocus();
  });

  it('labels supersession items and omits the shares line when no theme is shared', () => {
    render(
      <RelatedInstruments
        items={[
          { id: 'new', title: 'Successor', jurisdiction: 'federal', type: 'guideline', sharedThemes: [], relation: 'Superseded by' },
        ]}
      />,
    );
    expect(screen.getByText('Superseded by')).toBeInTheDocument();
    expect(screen.queryByText(/^Shares:/)).toBeNull();
  });

  it('sets the supersession label in the repealed status colour and nothing else', () => {
    render(
      <RelatedInstruments
        items={[
          { id: 'new', title: 'Successor', jurisdiction: 'federal', type: 'guideline', sharedThemes: [], relation: 'Superseded by' },
          ...items(1),
        ]}
      />,
    );
    expect(screen.getByText('Superseded by')).toHaveClass('text-[var(--status-repealed)]');
    expect(screen.getByText('Shares: Generative AI, Courts and tribunals')).not.toHaveClass('text-[var(--status-repealed)]');
  });

  it('puts the first eight items in the server-rendered HTML, before any script runs', () => {
    const html = renderToStaticMarkup(<RelatedInstruments items={items(11)} />);
    expect(html.match(/<li /g)).toHaveLength(8);
    expect(html.match(/Shares: /g)).toHaveLength(8);
    expect(html).toContain('Show all 11 related');
    expect(html).not.toContain('Record 8');
  });
});
