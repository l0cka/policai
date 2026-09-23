import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
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
});
