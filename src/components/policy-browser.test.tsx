import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => window.history.replaceState({}, '', '/'));
import { PolicyBrowser } from './policy-browser';
import type { Policy } from '@/types';

const policies: Policy[] = ['federal', 'nsw'].map((jurisdiction, index) => ({
  id: `record-${index}`,
  title: index ? 'NSW guidance' : 'Federal framework',
  description: index
    ? 'Court guidance for practitioners'
    : 'Public sector assurance',
  jurisdiction: jurisdiction as Policy['jurisdiction'],
  type: index ? 'guideline' : 'framework',
  status: index ? 'proposed' : 'active',
  effectiveDate: '2026-01-01',
  dates: [
    { type: 'issued', date: '2026-01-01', precision: 'year', primary: true },
  ],
  agencies: ['Test department'],
  tags: ['assurance'],
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
}));
const props = {
  policies,
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

const paginatedPolicies = Array.from({ length: 24 }, (_, index) => ({
  ...policies[index % 2],
  id: `page-record-${index}`,
  title: `Policy ${String(index).padStart(2, '0')}`,
}));

describe('Editorial register', () => {
  it('restores a shared view and keeps search, sort and pagination in the address', () => {
    window.history.replaceState({ marker: 'preserve' }, '', '/?q=Policy&jurisdiction=federal&view=table&page=2&sort=title:asc');
    render(<PolicyBrowser {...props} policies={paginatedPolicies} />);
    expect(screen.getByRole('searchbox')).toHaveValue('Policy');
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'all' } });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('all');
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false);
    expect(window.history.state.marker).toBe('preserve');
  });

  it.each([
    ['jurisdiction', 'Jurisdiction'],
    ['type', 'Type'],
    ['status', 'Status'],
    ['title', 'Policy'],
    ['effectiveDate', 'Key date'],
  ])('synchronizes %s in both directions between the dropdown and header', (field, label) => {
    render(<PolicyBrowser {...props} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Table' })[0]);
    const select = screen.getByRole('combobox', { name: 'Sort policies' });
    const header = within(screen.getByRole('table')).getByRole('button', { name: label });
    for (const direction of ['asc', 'desc']) {
      expect(within(select).getAllByRole('option').some((option) =>
        (option as HTMLOptionElement).value === `${field}:${direction}`,
      )).toBe(true);
      fireEvent.change(select, { target: { value: `${field}:${direction}` } });
      expect(header.closest('th')).toHaveAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      fireEvent.click(header);
      expect(select).toHaveValue(`${field}:${direction === 'asc' ? 'desc' : 'asc'}`);
    }
  });

  it.each(['search', 'jurisdiction', 'type', 'status'])('resets pagination when %s changes', (filter) => {
    render(<PolicyBrowser {...props} policies={paginatedPolicies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    if (filter === 'search') {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Policy' } });
    } else {
      const name = { jurisdiction: /Federal/, type: /Framework/, status: /^Active/ }[filter]!;
      fireEvent.click(within(screen.getByRole('group', { name: 'Register filters' })).getByRole('checkbox', { name }));
    }
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it('retains the focused header through repeated sorts and resets pagination from either control', () => {
    render(<PolicyBrowser {...props} policies={paginatedPolicies} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Table' })[0]);
    const header = within(screen.getByRole('table')).getByRole('button', { name: 'Policy' });
    for (const direction of ['ascending', 'descending', 'ascending', 'descending']) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
      header.focus();
      fireEvent.click(header);
      expect(header).toHaveFocus();
      expect(header.closest('th')).toHaveAttribute('aria-sort', direction);
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort policies' }), {
      target: { value: 'effectiveDate:asc' },
    });
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('leads with search and readable records, with developments explicitly separate', () => {
    render(<PolicyBrowser {...props} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Australian AI policy.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveAccessibleName(
      'Search policies, agencies or topics',
    );
    expect(screen.getAllByRole('group', { name: 'Policy view' })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole('button', { name: 'List' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText(
        'Automated detections are separate from verified register records.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Browse developments/ }),
    ).toHaveAttribute('href', '/developments');
  });

  it('preserves multi-select and combined filters, chips, search reset and shortcut', () => {
    render(<PolicyBrowser {...props} />);
    const filters = screen.getByRole('group', { name: 'Register filters' });
    fireEvent.click(within(filters).getByRole('checkbox', { name: /Federal/ }));
    fireEvent.click(
      within(filters).getByRole('checkbox', { name: /New South Wales/ }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 policies');
    fireEvent.click(
      within(filters).getByRole('checkbox', { name: /Proposed/ }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 policy');
    expect(
      screen.queryByRole('link', { name: 'Federal framework' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove filter: Proposed' }),
    );
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'public sector' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 policy');
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear search and filters' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 policies');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('closes filter disclosures with Escape and returns focus to the disclosure', () => {
    const { container } = render(<PolicyBrowser {...props} />);
    const details = container.querySelector('details')!;
    details.open = true;
    const checkbox = within(details).getByRole('checkbox', { name: /Federal/ });
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')).toHaveFocus();
  });

  it('keeps year-only dates and full-record navigation in editorial rows', () => {
    render(<PolicyBrowser {...props} />);
    expect(
      screen.getAllByRole('link', { name: 'Federal framework' })[0],
    ).toHaveAttribute('href', '/policies/record-0');
    expect(
      screen.getAllByRole('link', {
        name: 'Official source for Federal framework',
      })[0],
    ).toHaveAttribute('href', 'https://example.gov.au/policy');
    expect(screen.getAllByText('2026').length).toBeGreaterThan(0);
    expect(screen.queryByText('01 Jan 2026')).not.toBeInTheDocument();
  });

  it('lists upcoming recorded dates with an honest countdown', () => {
    const upcoming = (policyId: string, policyTitle: string, dateType: 'effective' | 'consultation_closed' | 'commenced', date: string, precision: 'day' | 'month') => ({
      policyId, policyTitle, dateType, date, precision,
      jurisdiction: 'federal' as const, type: 'guideline' as const, status: 'active' as const,
      sourceUrl: 'https://example.gov.au/policy',
    });
    render(
      <PolicyBrowser
        {...props}
        today="2026-09-23"
        upcomingDates={[
          upcoming('record-1', 'NSW guidance', 'consultation_closed', '2026-09-23', 'day'),
          upcoming('record-0', 'Federal framework', 'effective', '2026-10-20', 'day'),
          upcoming('record-2', 'Month rule', 'commenced', '2026-12-01', 'month'),
        ]}
      />,
    );
    const section = screen.getByRole('heading', { name: 'Coming up' }).closest('section') as HTMLElement;
    expect(within(section).getByRole('link', { name: 'Federal framework' })).toHaveAttribute('href', '/policies/record-0');
    expect(section).toHaveTextContent('Effective · 20 October 2026 · in 27 days');
    expect(section).toHaveTextContent('Consultation closed · 23 September 2026 · today');
    expect(section).toHaveTextContent('Commenced · December 2026');
    expect(section).not.toHaveTextContent(/December 2026 ·/);
    expect(within(section).getByRole('link', { name: /All upcoming dates/ })).toHaveAttribute('href', '/this-week');
  });

  it('omits the upcoming panel when nothing is scheduled', () => {
    render(<PolicyBrowser {...props} today="2026-09-23" upcomingDates={[]} />);
    expect(screen.queryByRole('heading', { name: 'Coming up' })).not.toBeInTheDocument();
  });
});
