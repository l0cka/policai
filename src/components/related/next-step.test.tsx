import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RuleScope } from '@/lib/rule-finder/scope';
import { KeepTrack } from './keep-track';
import { WhoThisAppliesTo } from './who-this-applies-to';

const review = { status: 'reviewed', draftedBy: 'a', draftedAt: '2026-10-01', reviewedBy: 'b', reviewedAt: '2026-10-02' } as const;

const rule: RuleScope = {
  policyId: 'p',
  kind: 'rule',
  legalForce: 'binding',
  appliesTo: ['privacy_act_entity'],
  scope: { quote: 'This applies to an APP entity.', pinpoint: 's 6', url: 'https://example.gov.au/act' },
  review,
};

describe('WhoThisAppliesTo', () => {
  it('quotes the reviewed scope with its legal force and audience, and links the rule finder', () => {
    render(<WhoThisAppliesTo scope={rule} />);
    expect(screen.getByRole('heading', { name: 'Who this applies to' })).toBeInTheDocument();
    expect(screen.getByText('Binding.')).toBeInTheDocument();
    expect(screen.getByText('Organisations covered by the Privacy Act')).toBeInTheDocument();
    expect(screen.getByText('“This applies to an APP entity.”')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 's 6' })).toHaveAttribute('href', 'https://example.gov.au/act');
    expect(screen.getByRole('link', { name: /rules that name organisations like yours/ })).toHaveAttribute(
      'href',
      '/rule-finder',
    );
    expect(screen.queryByText(/you comply|you must/i)).toBeNull();
  });

  it('states the note for a record that sets no obligation', () => {
    render(<WhoThisAppliesTo scope={{ policyId: 'p', kind: 'not_a_rule', note: 'A strategy; it sets no obligation.', review }} />);
    expect(screen.getByText('A strategy; it sets no obligation.')).toBeInTheDocument();
  });

  it('renders nothing without a reviewed scope', () => {
    const { container, rerender } = render(<WhoThisAppliesTo scope={undefined} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<WhoThisAppliesTo scope={{ ...rule, review: { status: 'draft', draftedBy: 'a', draftedAt: '2026-10-01' } }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('KeepTrack', () => {
  it('offers each follow and the feed', () => {
    render(
      <KeepTrack
        follows={[
          { follow: { kind: 'policy', id: 'p' }, label: 'this record' },
          { follow: { kind: 'jurisdiction', id: 'vic' }, label: 'Victoria' },
        ]}
        feed={{ href: '/feed.xml', label: 'New developments by RSS' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Follow this record' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Follow Victoria' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Following' })).toHaveAttribute('href', '/following');
    expect(screen.getByRole('link', { name: 'New developments by RSS' })).toHaveAttribute('href', '/feed.xml');
  });
});
