import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';
import { TimelineBrowser } from '@/components/timeline-browser';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
});

type Events = Parameters<typeof TimelineBrowser>[0]['timelineData'];

const events = [
  {
    id: 'event-federal',
    date: '2026-03-02',
    title: 'Federal guidance published',
    description: 'A federal event.',
    type: 'policy_introduced',
    jurisdiction: 'federal',
    verification: { status: 'verified' },
  },
  {
    id: 'event-nsw',
    date: '2025-07-01',
    title: 'NSW framework amended',
    description: 'A New South Wales event.',
    type: 'policy_amended',
    jurisdiction: 'nsw',
    verification: { status: 'verified' },
  },
] as unknown as Events;

function renderTimeline() {
  render(<TimelineBrowser timelineData={events} policiesData={[]} />);
}

it('shows the full count and no clear control before a filter is chosen', () => {
  renderTimeline();
  expect(screen.getByText('2 of 2 events')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
});

it('narrows by jurisdiction and event type, then clears both at once', () => {
  renderTimeline();
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by jurisdiction' }), { target: { value: 'nsw' } });
  expect(screen.getByText('1 of 2 events')).toBeInTheDocument();
  expect(screen.queryByText('Federal guidance published')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by event type' }), { target: { value: 'policy_introduced' } });
  expect(screen.getByText('0 of 2 events')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('2 of 2 events')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Filter by jurisdiction' })).toHaveValue('all');
  expect(screen.getByRole('combobox', { name: 'Filter by event type' })).toHaveValue('all');
  expect(screen.getByText('Federal guidance published')).toBeInTheDocument();
});
