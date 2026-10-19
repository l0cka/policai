import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PolicyBrowser } from './policy-browser';
import type { Policy } from '@/types';

beforeEach(() => window.history.replaceState({}, '', '/'));

function policy(id: string, title: string, themes: Policy['themes']): Policy {
  return {
    id,
    title,
    description: `${title} description`,
    jurisdiction: 'federal',
    type: 'guideline',
    status: 'active',
    effectiveDate: '2026-01-01',
    dates: [{ type: 'issued', date: '2026-01-01', precision: 'year', primary: true }],
    agencies: ['Test department'],
    tags: ['assurance'],
    themes,
    sourceUrl: 'https://example.gov.au/policy',
    content: '',
    aiSummary: '',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    verification: {
      status: 'verified',
      source: { url: 'https://example.gov.au/policy' },
      checkedAt: '2026-01-01',
    },
  };
}

const props = {
  policies: [
    policy('legal', 'Court AI note', ['legal-practice']),
    policy('agency', 'Agency framework', ['public-sector']),
  ],
  developments: [],
  developmentCount: 5,
  weeklyDevelopmentCount: 2,
  lastCollectedAt: '2026-09-20',
  lastHealthyAt: '2026-09-20',
  lastReviewedAt: null,
  collectionHealth: 'healthy' as const,
  successfulSourceCount: 10,
  dueSourceCount: 10,
  automaticSourceCount: 12,
  manualSourceCount: 2,
  currentManualSourceCount: 1,
  unavailableManualSourceCount: 1,
};

describe('Homepage discovery', () => {
  it('renders the register heading, the developments link and the two theme links', () => {
    render(<PolicyBrowser {...props} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Australian AI policy.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse developments/ })).toHaveAttribute('href', '/developments');
    expect(screen.getByRole('link', { name: 'Evidence and legal practice' })).toHaveAttribute('href', '/?theme=legal-practice');
    expect(screen.getByRole('link', { name: 'Public sector use' })).toHaveAttribute('href', '/?theme=public-sector');
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('filters the register from a theme link and keeps the links on a shared jurisdiction URL', () => {
    window.history.replaceState({}, '', '/?jurisdiction=federal');
    render(<PolicyBrowser {...props} />);
    expect(screen.getByRole('link', { name: /Browse developments/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Evidence and legal practice' })).toHaveAttribute(
      'href',
      '/?jurisdiction=federal&theme=legal-practice',
    );

    fireEvent.click(screen.getByRole('link', { name: 'Evidence and legal practice' }));
    expect(new URLSearchParams(window.location.search).get('theme')).toBe('legal-practice');
    expect(screen.getByRole('status')).toHaveTextContent('1 policy');
    expect(screen.getAllByRole('link', { name: 'Court AI note' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Agency framework' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Public sector use' }));
    expect(new URLSearchParams(window.location.search).get('theme')).toBe('public-sector');
    expect(screen.getByRole('status')).toHaveTextContent('1 policy');
    expect(screen.getAllByRole('link', { name: 'Agency framework' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Court AI note' })).not.toBeInTheDocument();
  });
});
