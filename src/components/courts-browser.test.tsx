import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusPill } from './policy-indicators';
import { CourtsBrowser } from './courts-browser';
import { PolicyDetailTabs } from '@/app/policies/[id]/policy-detail-tabs';
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

beforeEach(() => window.history.replaceState({}, '', '/courts'));

describe('CourtsBrowser', () => {
  it('preserves the literal search query all rather than treating it as a filter default', () => {
    render(<CourtsBrowser policies={policies} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'all' } });
    expect(screen.getByRole('searchbox')).toHaveValue('all');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('all');
  });
  it('counts the same judicial audience it filters from published actors', () => {
    const untagged = { ...policies[0], tags: ['courts'] };
    render(<CourtsBrowser policies={[untagged]} requirements={requirements} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by audience' }), { target: { value: 'judicial' } });
    expect(screen.getByText('1 of 1 instruments')).toBeInTheDocument();
    expect(screen.getByText('for judicial officers').parentElement).toHaveTextContent('1');
  });
  it('restores saved scroll only after the URL state has been rendered', async () => {
    window.history.replaceState({ courtsScroll: 650 }, '', '/courts?jurisdiction=vic&expanded=judicial-guidance');
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const height = vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2000);
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    render(<CourtsBrowser policies={policies} />);
    expect(screen.getByRole('link', { name: 'View full record' })).toBeInTheDocument();
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 650, behavior: 'instant' }));
    scroll.mockRestore();
    rects.mockRestore();
    height.mockRestore();
    vi.unstubAllGlobals();
  });
  it('saves scroll on the research history entry before opening full record', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 650 });
    render(<CourtsBrowser policies={policies} />);
    fireEvent.click(screen.getByRole('button', { name: /Guidelines for judicial officers/ }));
    const link = screen.getByRole('link', { name: 'View full record' });
    link.addEventListener('click', event => event.preventDefault()); // jsdom cannot navigate; browser suite covers the real link.
    fireEvent.click(link);
    expect(window.history.state.courtsScroll).toBe(650);
  });
  it('shows the individual source check date without claiming new review', () => {
    render(<CourtsBrowser policies={policies} />);
    fireEvent.click(screen.getByRole('button', { name: /Guidelines for judicial officers/ }));
    expect(screen.getByText(/Record source checked: 5 June 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Collection freshness is not a new editorial review/)).toBeInTheDocument();
  });
  it('explains jurisdiction coverage rather than implying no applicable law', () => {
    render(<CourtsBrowser policies={policies} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by jurisdiction' }), { target: { value: 'tas' } });
    expect(screen.getByText('No currently verified instruments')).toBeInTheDocument();
    expect(screen.getByText(/withheld until their official source evidence is current/)).toBeInTheDocument();
  });
  it('qualifies future commencement in Courts, the register and detail', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T02:00:00Z'));
    try {
      const future = { ...policies[0], dates: [{ type: 'effective' as const, date: '2026-10-20', precision: 'day' as const, primary: true }] };
      const view = render(<CourtsBrowser policies={[future]} />);
      expect(screen.getByText('Not yet in effect')).toBeInTheDocument();
      view.unmount();
      const pill = render(<StatusPill status="active" dates={future.dates} />);
      expect(screen.getByText('Not yet in effect')).toBeInTheDocument();
      pill.unmount();
      render(<PolicyDetailTabs policy={future} relatedPolicies={[]} />);
      expect(screen.getAllByText('Not yet in effect')).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });
  it('exposes disclosure state and associates the controlled panel', () => {
    render(<CourtsBrowser policies={policies} requirements={requirements} />);
    const button = screen.getByRole('button', { name: /Guidelines for judicial officers/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeVisible();
  });
  it('restores filters, sort and expanded instrument when returning to the URL', () => {
    const view = render(<CourtsBrowser policies={policies} requirements={requirements} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by jurisdiction' }), { target: { value: 'vic' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort guidance' }), { target: { value: 'newest' } });
    fireEvent.click(screen.getByRole('button', { name: /Guidelines for judicial officers/ }));
    view.unmount();
    render(<CourtsBrowser policies={policies} requirements={requirements} />);
    expect(screen.getByRole('combobox', { name: 'Filter by jurisdiction' })).toHaveValue('vic');
    expect(screen.getByRole('combobox', { name: 'Sort guidance' })).toHaveValue('newest');
    expect(screen.getByRole('link', { name: /Source document/ })).toBeInTheDocument();
  });
  it('carries structured requirements and exceptions into the full record', () => {
    render(<PolicyDetailTabs policy={policies[0]} relatedPolicies={[]} courtRequirements={[{ ...requirements[0], exceptions: ['Only with prior leave.'] }]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Key requirements' }));
    expect(screen.getByText('Verified requirements (1)')).toBeInTheDocument();
    expect(screen.getByText('Exception: Only with prior leave.')).toBeInTheDocument();
    expect(screen.getByText('paragraph 4')).toBeInTheDocument();
  });
  it.each(['affidavit', 'confidentiality', 'prior leave', 'paragraph 4'])('finds structured requirement topic %s', (query) => {
    render(<CourtsBrowser policies={policies} requirements={[{ ...requirements[0], action: 'Prepare an affidavit.', conditions: ['confidentiality'], exceptions: ['prior leave'] }]} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search court guidance' }), { target: { value: query } });
    expect(screen.getByText('1 of 2 instruments')).toBeInTheDocument();
  });
  it('shows material exceptions beside the lead rule, outside the quotation', () => {
    render(<CourtsBrowser policies={policies} requirements={[{ ...requirements[0], exceptions: ['Only with prior leave and confidentiality safeguards.'] }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Guidelines for judicial officers/ }));
    expect(screen.getByText(/Exception: Only with prior leave and confidentiality safeguards/)).toBeInTheDocument();
  });
  it('includes mixed practitioner audiences from public requirements, not non-lawyers', () => {
    const mixed = { ...requirements[0], actor: 'Legal practitioners and unrepresented parties' };
    render(<CourtsBrowser policies={policies} requirements={[mixed]} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by audience' }), { target: { value: 'profession' } });
    expect(screen.getByText('Guidelines for judicial officers')).toBeInTheDocument();
    expect(screen.queryByText('Information for self-represented litigants')).not.toBeInTheDocument();
  });
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
