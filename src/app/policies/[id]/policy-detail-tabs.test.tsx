import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Policy } from '@/types';
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

  it('shows the Policy changes card when the record has instrument dates', () => {
    render(<PolicyDetailTabs policy={policy} />);
    expect(screen.getByRole('heading', { name: 'Policy changes' })).toBeInTheDocument();
  });

  it('omits the Policy changes card when the record has no instrument dates', () => {
    const deadlineOnly: Policy = {
      ...policy,
      dates: [{ type: 'consultation_closed', date: '2026-02-01', precision: 'day' }],
    };
    render(<PolicyDetailTabs policy={deadlineOnly} />);
    expect(screen.queryByRole('heading', { name: 'Policy changes' })).toBeNull();
  });
});

describe('PolicyDetailTabs related slot', () => {
  it('renders the related node in the summary column', () => {
    render(<PolicyDetailTabs policy={policy} related={<p>related slot</p>} />);
    expect(screen.getByText('related slot')).toBeInTheDocument();
  });
});
