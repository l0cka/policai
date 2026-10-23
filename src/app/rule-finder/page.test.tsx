import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { getPolicies, getRuleScopes } from '@/lib/data-service';
import { parseRuleScopes } from '@/lib/rule-finder/scope';
import { readFollows } from '@/lib/follows';
import RuleFinderPage from './page';

vi.mock('@/lib/data-service', () => ({ getPolicies: vi.fn(), getRuleScopes: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const reviewed = {
  status: 'reviewed',
  draftedBy: 'Claude (agent)',
  draftedAt: '2026-10-23',
  reviewedBy: 'Daniel Alkurdi',
  reviewedAt: '2026-10-23',
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/rule-finder');
  vi.mocked(getPolicies).mockResolvedValue([
    buildPolicy({ id: 'dta-policy', title: 'Policy for the Responsible Use of AI in Government' }),
    buildPolicy({ id: 'sc-gen-23', title: 'SC Gen 23', jurisdiction: 'nsw' }),
  ]);
  vi.mocked(getRuleScopes).mockResolvedValue(
    parseRuleScopes([
      {
        policyId: 'dta-policy',
        kind: 'rule',
        legalForce: 'government_mandatory',
        appliesTo: ['commonwealth_entity'],
        scope: { quote: 'This policy applies to all non-corporate Commonwealth entities.', pinpoint: 'Application', url: 'https://www.digital.gov.au/policy' },
        review: reviewed,
      },
      {
        policyId: 'sc-gen-23',
        kind: 'rule',
        legalForce: 'binding',
        appliesTo: ['court_user'],
        scope: { quote: 'This Practice Note applies to all proceedings.', pinpoint: 'para 1', url: 'https://supremecourt.nsw.gov.au/sc-gen-23' },
        review: reviewed,
      },
    ]),
  );
});

afterEach(() => vi.clearAllMocks());

function answer(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

it('walks a Commonwealth official through the questions to quoted, grouped results', async () => {
  render(await RuleFinderPage());

  expect(screen.getByText('Question 1 of 10')).toBeInTheDocument();
  answer('Commonwealth only');
  answer('Yes');
  for (let index = 0; index < 4; index += 1) answer('No');
  answer('No');
  for (let index = 0; index < 3; index += 1) answer('No');

  expect(screen.getByRole('heading', { name: '1 rule names organisations like yours' })).toBeInTheDocument();
  const group = screen.getByRole('region', { name: 'Mandatory for government · 1' });
  expect(within(group).getByRole('link', { name: 'Policy for the Responsible Use of AI in Government' })).toHaveAttribute(
    'href',
    '/policies/dta-policy',
  );
  expect(within(group).getByText(/applies to all non-corporate Commonwealth entities/)).toBeInTheDocument();
  expect(screen.queryByText('SC Gen 23')).not.toBeInTheDocument();
  expect(screen.getByText(/not legal advice/)).toBeInTheDocument();
  expect(window.location.search).toBe('?who=commonwealth_entity&where=');

  answer('Follow all 1');
  expect(readFollows()).toEqual([{ kind: 'policy', id: 'dta-policy' }]);
  expect(screen.getByRole('button', { name: 'Following all of these' })).toBeDisabled();
});

it('opens a shared link on its results', async () => {
  window.history.replaceState(null, '', '/rule-finder?who=court_user&where=nsw');
  render(await RuleFinderPage());
  expect(await screen.findByRole('region', { name: 'Binding · 1' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'SC Gen 23' })).toBeInTheDocument();
});

it('stays hidden until an editor has reviewed a scope entry', async () => {
  vi.mocked(getRuleScopes).mockResolvedValue([]);
  await expect(RuleFinderPage()).rejects.toThrow('NEXT_NOT_FOUND');
});
