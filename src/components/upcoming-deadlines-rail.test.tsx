import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import {
  selectUpcomingPolicyDates,
  splitUpcomingDeadlines,
  weekWindowEndingAt,
} from '@/lib/this-week';
import type { Policy } from '@/types';
import { UpcomingDeadlinesRail } from './upcoming-deadlines-rail';

const TODAY = '2026-10-06';
const window = weekWindowEndingAt('2026-10-06T01:00:00.000Z')!;

// Synthetic records only: the repository data stays unchanged.
function fixturePolicy(id: string, title: string, deadlines: Policy['dates']): Policy {
  const policy = buildPolicy({ id, title });
  return { ...policy, dates: [...policy.dates, ...deadlines] };
}

function railItems(policies: Policy[]) {
  return splitUpcomingDeadlines(selectUpcomingPolicyDates(policies, window)).deadlines;
}

function rail() {
  return screen.getByRole('region', { name: 'Upcoming deadlines' });
}

describe('UpcomingDeadlinesRail', () => {
  it('lists a recorded deadline with its countdown and a link to the policy', () => {
    const items = railItems([
      fixturePolicy('fixture-consultation', 'Fixture consultation paper', [
        { type: 'consultation_closed', date: '2026-10-20', precision: 'day' },
      ]),
    ]);

    render(<UpcomingDeadlinesRail items={items} today={TODAY} />);

    expect(within(rail()).getByRole('link', { name: 'Fixture consultation paper' }))
      .toHaveAttribute('href', '/policies/fixture-consultation');
    expect(rail()).toHaveTextContent('Consultation closed · 20 October 2026 · in 14 days');
    expect(rail().querySelector('time')).toHaveAttribute('datetime', '2026-10-20');
    expect(rail()).not.toHaveTextContent('No upcoming deadlines recorded');
  });

  it('renders month and year deadlines at their own precision, with no invented day', () => {
    const items = railItems([
      fixturePolicy('fixture-compliance', 'Fixture compliance rule', [
        { type: 'compliance_due', date: '2027-07-01', precision: 'month' },
      ]),
      fixturePolicy('fixture-review', 'Fixture framework', [
        { type: 'scheduled_review', date: '2028-01-01', precision: 'year' },
      ]),
    ]);

    render(<UpcomingDeadlinesRail items={items} today={TODAY} />);

    const entries = within(rail()).getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Compliance due · July 2027');
    expect(entries[0]).toHaveTextContent('exact day not recorded');
    expect(entries[0]).not.toHaveTextContent(/1 July|in \d+ days/);
    expect(entries[0].querySelector('time')).toHaveAttribute('datetime', '2027-07');
    expect(entries[1]).toHaveTextContent('Scheduled review · 2028');
    expect(entries[1]).not.toHaveTextContent(/January|in \d+ days/);
    expect(entries[1].querySelector('time')).toHaveAttribute('datetime', '2028');
  });

  it('shows the soonest items up to the limit', () => {
    const items = railItems(
      ['a', 'b', 'c'].map((suffix, index) =>
        fixturePolicy(`fixture-${suffix}`, `Fixture ${suffix}`, [
          { type: 'compliance_due', date: `2026-1${index}-15`, precision: 'day' },
        ]),
      ),
    );

    render(<UpcomingDeadlinesRail items={items} today={TODAY} limit={2} />);

    expect(within(rail()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Fixture a'),
      expect.stringContaining('Fixture b'),
    ]);
  });

  it('stays visible with an empty state when no deadline is recorded', () => {
    const items = railItems([buildPolicy()]);
    expect(items).toEqual([]);

    render(<UpcomingDeadlinesRail items={items} today={TODAY} />);

    expect(screen.getByRole('heading', { name: 'Upcoming deadlines' })).toBeInTheDocument();
    expect(rail()).toHaveTextContent('No upcoming deadlines recorded');
    expect(within(rail()).queryByRole('list')).not.toBeInTheDocument();
    expect(within(rail()).getByRole('link', { name: /All deadlines on This week/ }))
      .toHaveAttribute('href', '/this-week#coming-up');
  });
});
