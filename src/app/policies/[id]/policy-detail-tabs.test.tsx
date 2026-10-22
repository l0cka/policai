import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Policy } from '@/types';
import { parseSiteReuse } from '@/lib/watch-coverage/site-reuse';
import { PolicyDetailTabs } from './policy-detail-tabs';

const policy: Policy = {
  id: 'record-1',
  title: 'Guidance note',
  description: 'A description',
  jurisdiction: 'federal',
  type: 'guideline',
  status: 'active',
  effectiveDate: '2026-01-01',
  dates: [{ type: 'issued', date: '2026-01-01', precision: 'day', primary: true }],
  agencies: ['Test department'],
  tags: [],
  themes: ['generative-ai'],
  sourceUrl: 'https://example.gov.au/policy',
  content:
    'Three requirements apply to every filing made here. Requirement 1: state that AI was used. Requirement 2: check the document by hand.',
  aiSummary: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  verification: { status: 'verified', source: { url: 'https://example.gov.au/policy' }, checkedAt: '2026-01-01' },
};

describe('PolicyDetailTabs', () => {
  it('renders each Requirement marker as its own labelled block', () => {
    render(<PolicyDetailTabs policy={policy} />);
    expect(screen.getByText('Requirement 1:').tagName).toBe('STRONG');
    expect(screen.getByText('Requirement 2:').tagName).toBe('STRONG');
  });

  it('leads with the official source and keeps the other actions under More', () => {
    render(<PolicyDetailTabs policy={policy} />);
    expect(screen.getByRole('link', { name: 'View official source' })).toHaveAttribute('href', policy.sourceUrl);
    expect(screen.getByRole('button', { name: 'Follow Guidance note' })).toHaveTextContent(/^Follow$/);
    const more = screen.getByText('More').closest('details')!;
    expect(more.open).toBe(false);
    for (const name of ['Copy link', 'Download data']) {
      expect(within(more).getByRole('button', { name, hidden: true })).toBeInTheDocument();
    }
    expect(within(more).getByRole('link', { name: 'Markdown with sources', hidden: true })).toHaveAttribute(
      'href',
      '/api/policies/record-1/markdown',
    );
    more.open = true;
    fireEvent.keyDown(within(more).getByRole('button', { name: 'Copy link' }), { key: 'Escape' });
    expect(more.open).toBe(false);
  });

  it('shows the status and each recorded date once', () => {
    render(<PolicyDetailTabs policy={policy} />);
    expect(screen.getAllByText('Active')).toHaveLength(1);
    expect(screen.getAllByText('Issued')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Policy changes' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Source verification' })).toBeNull();
    expect(screen.getByText('Verified against the official source')).toBeInTheDocument();
  });
});

describe('PolicyDetailTabs site reuse terms', () => {
  it('links the source site’s licence to the copyright page it came from', () => {
    const [sourceReuse] = parseSiteReuse([
      {
        host: 'example.gov.au',
        status: 'stated',
        terms: { kind: 'creative_commons', licence: 'CC-BY-4.0' },
        termsUrl: 'https://example.gov.au/copyright',
        checkedAt: '2026-10-22',
      },
    ]);
    render(<PolicyDetailTabs policy={policy} sourceReuse={sourceReuse} />);
    expect(screen.getByText('Site reuse terms').nextElementSibling).toHaveTextContent('CC BY 4.0');
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://example.gov.au/copyright');
  });

  it('says nothing about reuse when the site has not been checked', () => {
    render(<PolicyDetailTabs policy={policy} />);
    expect(screen.queryByText('Site reuse terms')).toBeNull();
  });
});

describe('PolicyDetailTabs related slot', () => {
  it('renders the related node in the summary column', () => {
    render(<PolicyDetailTabs policy={policy} related={<p>related slot</p>} />);
    expect(screen.getByText('related slot')).toBeInTheDocument();
  });
});
