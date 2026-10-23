import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { decodeAnswers, encodeAnswers } from './questions';
import { findRules, parseRuleScopes, ruleScopeCoverage, type RuleScope } from './scope';

const reviewed = {
  status: 'reviewed',
  draftedBy: 'Claude (agent)',
  draftedAt: '2026-10-23',
  reviewedBy: 'Daniel Alkurdi',
  reviewedAt: '2026-10-23',
} as const;

function rule(policyId: string, overrides: Record<string, unknown> = {}) {
  return {
    policyId,
    kind: 'rule',
    legalForce: 'binding',
    appliesTo: ['commonwealth_entity'],
    scope: { quote: 'This policy applies to all non-corporate Commonwealth entities.', pinpoint: 'para 1', url: 'https://example.gov.au/policy' },
    review: reviewed,
    ...overrides,
  };
}

describe('parseRuleScopes', () => {
  it('reads a rule and a record that sets no obligation', () => {
    const scopes = parseRuleScopes([
      rule('dta-policy'),
      { policyId: 'national-plan', kind: 'not_a_rule', note: 'A strategy; it sets no obligations.', review: { status: 'draft', draftedBy: 'Claude (agent)', draftedAt: '2026-10-23' } },
    ]);
    expect(scopes.map((scope) => scope.kind)).toEqual(['rule', 'not_a_rule']);
  });

  it.each([
    ['an unknown audience', rule('a', { appliesTo: ['everyone_ever'] }), 'unknown audience everyone_ever'],
    ['no audience', rule('a', { appliesTo: [] }), 'appliesTo needs at least one audience'],
    ['an unknown legal force', rule('a', { legalForce: 'sort_of' }), 'unknown legalForce sort_of'],
    ['a quote-less scope', rule('a', { scope: { quote: ' ', pinpoint: 's 6', url: 'https://example.gov.au' } }), "scope needs the instrument's own words"],
    ['a plain-http source', rule('a', { scope: { quote: 'Applies to all.', pinpoint: 's 6', url: 'http://example.gov.au' } }), 'scope.url must be an https URL'],
    ['a reviewed entry with no reviewer', rule('a', { review: { ...reviewed, reviewedBy: '' } }), 'a reviewed scope needs reviewedBy'],
  ])('refuses %s', (_name, entry, message) => {
    expect(() => parseRuleScopes([entry])).toThrow(message);
  });

  it('refuses two entries for one record', () => {
    expect(() => parseRuleScopes([rule('a'), rule('a')])).toThrow('ruleScope:a: duplicate policyId');
  });
});

describe('ruleScopeCoverage', () => {
  const now = new Date('2026-10-23T02:00:00Z');

  it('refuses an entry for a record the register lacks, and a proposed record called binding', () => {
    const report = ruleScopeCoverage(
      parseRuleScopes([rule('ghost'), rule('bill')]),
      [{ id: 'bill', status: 'proposed' }],
      now,
    );
    expect(report.errors).toEqual([
      'ruleScope:ghost: no register record has this id',
      'ruleScope:bill: the record is proposed, so its legalForce must be proposed',
    ]);
  });

  it('counts records without an entry in one warning', () => {
    const report = ruleScopeCoverage(parseRuleScopes([rule('a')]), [
      { id: 'a', status: 'active' },
      { id: 'b', status: 'active' },
      { id: 'c', status: 'active' },
    ], now);
    expect(report).toEqual({ errors: [], warnings: ['ruleScope: 2 of 3 register records have no scope entry'] });
  });
});

describe('findRules', () => {
  const policies = [
    buildPolicy({ id: 'dta-policy', title: 'Policy for the Responsible Use of AI in Government' }),
    buildPolicy({ id: 'nsw-court', title: 'SC Gen 23', jurisdiction: 'nsw' }),
    buildPolicy({ id: 'guidance', title: 'Guidance for AI Adoption' }),
    buildPolicy({ id: 'old-standard', title: 'Voluntary AI Safety Standard', status: 'superseded' }),
    buildPolicy({ id: 'draft-only', title: 'Not yet reviewed' }),
  ];
  const scopes = parseRuleScopes([
    rule('dta-policy', { legalForce: 'government_mandatory' }),
    rule('nsw-court', { appliesTo: ['court_user'] }),
    rule('guidance', { legalForce: 'voluntary', appliesTo: ['any_organisation'] }),
    rule('old-standard', { legalForce: 'voluntary', appliesTo: ['any_organisation'] }),
    rule('draft-only', { review: { status: 'draft', draftedBy: 'Claude (agent)', draftedAt: '2026-10-23' } }),
  ]) satisfies RuleScope[];

  const ids = (answers: Parameters<typeof findRules>[2]) =>
    findRules(scopes, policies, answers).map((group) => [group.force, group.rules.map(({ policy }) => policy.id)]);

  it('groups matching reviewed rules by legal force, always including rules for any organisation', () => {
    expect(ids({ audiences: new Set(['commonwealth_entity']), jurisdictions: new Set() })).toEqual([
      ['government_mandatory', ['dta-policy']],
      ['voluntary', ['guidance']],
    ]);
  });

  it('shows a state rule only to readers who work in that state', () => {
    expect(ids({ audiences: new Set(['court_user']), jurisdictions: new Set() })).toEqual([['voluntary', ['guidance']]]);
    expect(ids({ audiences: new Set(['court_user']), jurisdictions: new Set(['nsw']) })).toEqual([
      ['binding', ['nsw-court']],
      ['voluntary', ['guidance']],
    ]);
  });

  it('round-trips answers through the address bar', () => {
    const answers = { audiences: new Set(['court_user', 'commonwealth_entity'] as const), jurisdictions: new Set(['vic', 'nsw'] as const) };
    const decoded = decodeAnswers(`?${encodeAnswers(answers)}`);
    expect(decoded && [...decoded.audiences].sort()).toEqual(['commonwealth_entity', 'court_user']);
    expect(decoded && [...decoded.jurisdictions]).toEqual(['nsw', 'vic']);
    expect(decodeAnswers('?other=1')).toBeNull();
  });
});
