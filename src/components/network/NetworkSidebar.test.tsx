import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NetworkSidebar } from './NetworkSidebar';
import type { NetworkConnection, NetworkNode } from '@/lib/network-data';

const selectedPolicy: NetworkNode = {
  id: 'federal-court-gpn-ai',
  title: 'GPN-AI — Use of Generative Artificial Intelligence',
  shortLabel: 'Federal Court GPN-AI',
  jurisdiction: 'federal',
  status: 'active',
  type: 'practice_note',
  tags: ['courts', 'judicial', 'disclosure'],
  agencies: ['Federal Court of Australia'],
  effectiveDate: '2025-09-01',
  dateType: 'issued',
  datePrecision: 'day',
  sourceUrl: 'https://example.gov.au/gpn-ai',
  description: 'Court guidance for the use of generative AI.',
  verificationStatus: 'verified',
  thematicDegree: 1,
  formalDegree: 0,
};

const relatedPolicy: NetworkNode = {
  ...selectedPolicy,
  id: 'nsw-sc-gen-23',
  title: 'SC Gen 23 — Use of Artificial Intelligence in Court Proceedings',
  shortLabel: 'NSW SC Gen 23',
  jurisdiction: 'nsw',
};

const connections: NetworkConnection[] = [
  {
    node: relatedPolicy,
    kinds: ['thematic'],
    sharedThemes: ['courts', 'judicial', 'disclosure'],
    weight: 4,
    crossJurisdiction: true,
  },
];

describe('NetworkSidebar', () => {
  it('exposes connection reasons and keyboard-reachable source actions', () => {
    const navigate = vi.fn();

    render(
      <NetworkSidebar
        policy={selectedPolicy}
        connections={connections}
        onClose={vi.fn()}
        onNavigateToNode={navigate}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Why these policies connect' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Shares 3 editorial themes: courts, judicial, disclosure')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /View full policy/ }),
    ).toHaveAttribute('href', '/policies/federal-court-gpn-ai');
    expect(
      screen.getByRole('link', { name: /Official source/ }),
    ).toHaveAttribute('href', 'https://example.gov.au/gpn-ai');

    fireEvent.click(screen.getByRole('button', { name: /NSW SC Gen 23/ }));
    expect(navigate).toHaveBeenCalledWith('nsw-sc-gen-23');
  });
});
