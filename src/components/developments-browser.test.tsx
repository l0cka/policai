import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Development } from '@/types';
import { DevelopmentsBrowser } from '@/components/developments-browser';

function development(id: string, title: string): Development {
  return {
    id,
    title,
    url: `https://example.gov.au/${id}`,
    sourceId: `${id}-source`,
    sourceName: 'Example source',
    jurisdiction: 'federal',
    detectedAt: '2026-09-20T00:00:00.000Z',
    relevanceScore: 0.6,
    classification: 'heuristic',
    assessment: { method: 'heuristic', assessedAt: '2026-09-20T00:00:00.000Z' },
    verification: { status: 'needs_review', source: { url: `https://example.gov.au/${id}` } },
    status: 'detected',
  } as Development;
}

it('filters the feed by stream', () => {
  render(
    <DevelopmentsBrowser
      developments={[
        development('inquiry', 'Senate opens inquiry into AI'),
        development('note', 'Federal Court issues GPN-AI practice note'),
      ]}
      streamById={{ inquiry: 'consultation', note: 'court' }}
      collectionHealth="healthy"
      lastCollectedAt={null}
      successfulSourceCount={1}
      dueSourceCount={1}
      automaticSourceCount={1}
      manualSourceCount={0}
      currentManualSourceCount={0}
    />,
  );

  expect(screen.getByText('Senate opens inquiry into AI')).toBeInTheDocument();
  expect(screen.getByText('Federal Court issues GPN-AI practice note')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Filter by stream'), {
    target: { value: 'court' },
  });

  expect(screen.queryByText('Senate opens inquiry into AI')).not.toBeInTheDocument();
  expect(screen.getByText('Federal Court issues GPN-AI practice note')).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: 'Consultations and inquiries' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
});

it('surfaces the Atom feed and JSON API for machine readers', () => {
  renderBrowser([development('inquiry', 'Senate opens inquiry into AI')]);

  expect(screen.getByRole('link', { name: 'developments feed' })).toHaveAttribute(
    'href',
    '/feed.xml',
  );
  expect(screen.getByRole('link', { name: 'JSON API' })).toHaveAttribute(
    'href',
    '/api/developments',
  );
});

it('ranks unconfirmed radar items by relevance before recency', () => {
  const olderHigh = {
    ...development('high', 'High relevance older lead'),
    relevanceScore: 0.65,
    detectedAt: '2026-09-01T00:00:00.000Z',
  };
  const newerLow = {
    ...development('low', 'Low relevance newer lead'),
    relevanceScore: 0.2,
    detectedAt: '2026-09-20T00:00:00.000Z',
  };
  renderBrowser([newerLow, olderHigh]);

  const titles = screen.getAllByRole('link').map((link) => link.textContent);
  const highIndex = titles.findIndex((text) => text?.includes('High relevance'));
  const lowIndex = titles.findIndex((text) => text?.includes('Low relevance'));
  expect(highIndex).toBeGreaterThanOrEqual(0);
  expect(lowIndex).toBeGreaterThanOrEqual(0);
  expect(highIndex).toBeLessThan(lowIndex);
});

it('explains an empty filter result and offers a reset', () => {
  render(
    <DevelopmentsBrowser
      developments={[development('inquiry', 'Senate opens inquiry into AI')]}
      streamById={{ inquiry: 'consultation' }}
      collectionHealth="healthy"
      lastCollectedAt={null}
      successfulSourceCount={1}
      dueSourceCount={1}
      automaticSourceCount={1}
      manualSourceCount={0}
      currentManualSourceCount={0}
    />,
  );

  fireEvent.change(screen.getByLabelText('Filter by stream'), {
    target: { value: 'court' },
  });
  fireEvent.change(screen.getByLabelText('Search developments'), {
    target: { value: 'nothing here' },
  });

  expect(screen.getByRole('status')).toHaveTextContent('No matching developments');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));

  expect(screen.getByText('Senate opens inquiry into AI')).toBeInTheDocument();
  expect(screen.getByLabelText('Search developments')).toHaveValue('');
  expect(screen.getByLabelText('Filter by stream')).toHaveValue('all');
  expect(
    screen.queryByRole('button', { name: 'Clear search and filters' }),
  ).not.toBeInTheDocument();
});

function verifiedDevelopment(id: string, title: string): Development {
  return {
    ...development(id, title),
    verification: { status: 'verified', source: { url: `https://example.gov.au/${id}` } },
  } as Development;
}

function renderBrowser(items: Development[], streamById: Record<string, 'consultation' | 'court'> = {}) {
  return render(
    <DevelopmentsBrowser
      developments={items}
      streamById={streamById}
      collectionHealth="healthy"
      lastCollectedAt={null}
      successfulSourceCount={1}
      dueSourceCount={1}
      automaticSourceCount={1}
      manualSourceCount={0}
      currentManualSourceCount={0}
    />,
  );
}

afterEach(() => {
  window.location.hash = '';
});

it('gives each development an anchor id (#223)', () => {
  renderBrowser([development('dev-a-1x', 'Alpha item')]);

  expect(screen.getByText('Alpha item').closest('article')).toHaveAttribute('id', 'dev-a-1x');
});

it('reveals an entry on load from the other tab and past active filters (#223)', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  window.location.hash = '#dev-radar-1';

  renderBrowser(
    [verifiedDevelopment('dev-ver-1', 'Verified item'), development('dev-radar-1', 'Radar item')],
    { 'dev-ver-1': 'consultation', 'dev-radar-1': 'court' },
  );

  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Radar item').closest('article')).toHaveAttribute('id', 'dev-radar-1');
  expect(screen.queryByText('Verified item')).not.toBeInTheDocument();
  expect(scroll.mock.contexts[0]).toBe(document.getElementById('dev-radar-1'));
});

it('reveals a hidden entry on hashchange by clearing filters (#223)', () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  renderBrowser(
    [development('dev-one', 'Senate opens inquiry'), development('dev-two', 'Court practice note')],
    { 'dev-one': 'consultation', 'dev-two': 'court' },
  );

  fireEvent.change(screen.getByLabelText('Filter by stream'), { target: { value: 'court' } });
  fireEvent.change(screen.getByLabelText('Search developments'), { target: { value: 'practice' } });
  expect(screen.queryByText('Senate opens inquiry')).not.toBeInTheDocument();

  act(() => {
    window.location.hash = '#dev-one';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  expect(screen.getByText('Senate opens inquiry')).toBeInTheDocument();
  expect(screen.getByLabelText('Search developments')).toHaveValue('');
  expect(screen.getByLabelText('Filter by stream')).toHaveValue('all');
  expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById('dev-one'));
});

it('leaves the feed alone for an unknown hash', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  window.location.hash = '#dev-missing';

  renderBrowser([development('dev-one', 'Senate opens inquiry')]);

  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(scroll).not.toHaveBeenCalled();
  expect(document.getElementById('dev-missing')).toBeNull();
});
