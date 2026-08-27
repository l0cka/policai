import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { CourtsBrowser } from './courts-browser';
import type { Jurisdiction, Policy, PublicCourtRequirement } from '@/types';

function policy({
  id,
  title,
  jurisdiction,
  agency,
  tags,
  date,
}: {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  agency: string;
  tags: string[];
  date: string;
}): Policy {
  const sourceUrl = `https://example.gov.au/${id}`;
  return {
    id,
    title,
    description: `${title} description`,
    jurisdiction,
    type: 'practice_note',
    status: 'active',
    effectiveDate: date,
    dates: [{ type: 'issued', date, precision: 'day', primary: true }],
    agencies: [agency],
    sourceUrl,
    content: `${title} details`,
    aiSummary: `${title} overview`,
    tags,
    createdAt: date,
    updatedAt: date,
    lastReviewedAt: date,
    verification: {
      status: 'verified',
      source: { url: sourceUrl },
      checkedAt: date,
    },
  };
}

const policies = [
  policy({
    id: 'judicial-guidance',
    title: 'Guidelines for judicial officers',
    jurisdiction: 'vic',
    agency: 'Supreme Court of Victoria',
    tags: ['courts', 'judicial officers', 'guidelines'],
    date: '2026-06-05',
  }),
  policy({
    id: 'litigant-guidance',
    title: 'Information for self-represented litigants',
    jurisdiction: 'sa',
    agency: 'Courts Administration Authority of South Australia',
    tags: ['courts', 'self-represented litigants', 'guidance'],
    date: '2025-05-01',
  }),
];

const requirements: PublicCourtRequirement[] = [
  {
    id: 'judicial-guidance-4a',
    policyId: 'judicial-guidance',
    actor: 'Judicial officers',
    modality: 'must_not',
    action: 'Use generative AI to formulate reasons.',
    conditions: [],
    exceptions: [],
    topics: ['reasons'],
    source: {
      url: 'https://example.gov.au/judicial-guidance',
      contentHash: 'a'.repeat(64),
      locator: 'paragraph 4',
      quote:
        'Judicial officers must not use generative AI to formulate reasons.',
    },
    extraction: {
      method: 'manual',
      extractedAt: '2026-08-26T00:00:00Z',
      extractedBy: 'Editor',
    },
    verification: {
      status: 'verified',
      reviewedAt: '2026-08-26T01:00:00Z',
      reviewedBy: 'Reviewer',
    },
    policy: policies[0],
  },
];

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
});

describe('CourtsBrowser', () => {
  it('filters by audience and keeps the official source reachable', () => {
    render(<CourtsBrowser policies={policies} requirements={requirements} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by audience' }), {
      target: { value: 'judicial' },
    });

    expect(screen.getByText('1 of 2 instruments')).toBeInTheDocument();
    expect(screen.getByText('jurisdictions').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Guidelines for judicial officers')).toBeInTheDocument();
    expect(screen.queryByText('Information for self-represented litigants')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Guidelines for judicial officers/ }));
    expect(screen.getByRole('link', { name: /Source document/ })).toHaveAttribute(
      'href',
      'https://example.gov.au/judicial-guidance',
    );
    expect(screen.getByText('Verified requirements (1)')).toBeInTheDocument();
    expect(
      screen.getByText('Use generative AI to formulate reasons.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Judicial officers must not/)).toHaveTextContent(
      'Judicial officers must not use generative AI to formulate reasons.',
    );
    expect(screen.getByText('paragraph 4')).toBeInTheDocument();
  });
});
