import { isValidCalendarDate, sydneyCalendarDate } from '@/lib/calendar-date';
import type { Jurisdiction, Policy, PolicyStatus } from '@/types';

/**
 * How strongly a register record binds anyone. This is a fact about the
 * instrument, never a view on whether a reader complies with it.
 */
export const LEGAL_FORCES = [
  {
    key: 'binding',
    label: 'Binding',
    description: 'Law, a legislative instrument, an enforceable code or a court direction.',
  },
  {
    key: 'government_mandatory',
    label: 'Mandatory for government',
    description: 'Policy that the named government bodies must follow.',
  },
  {
    key: 'regulator_expectation',
    label: 'Regulator expectation',
    description: 'Guidance from a regulator on how it applies existing law.',
  },
  {
    key: 'voluntary',
    label: 'Voluntary',
    description: 'Guidance, frameworks and standards that nobody is required to follow.',
  },
  {
    key: 'proposed',
    label: 'Proposed',
    description: 'A bill, draft or consultation that binds nobody yet.',
  },
] as const;

export type LegalForce = (typeof LEGAL_FORCES)[number]['key'];

/** Who an instrument says it covers, in its own words, sorted into groups a reader can recognise. */
export const AUDIENCES = [
  { key: 'commonwealth_entity', label: 'Australian Government entities' },
  { key: 'state_entity', label: 'State and territory government bodies' },
  { key: 'privacy_act_entity', label: 'Organisations covered by the Privacy Act' },
  { key: 'financial_services', label: 'Financial services, banking, insurance and markets' },
  { key: 'online_service', label: 'Online services, apps and AI products' },
  { key: 'court_user', label: 'Lawyers and parties in courts and tribunals' },
  { key: 'judicial_officer', label: 'Judges and tribunal members' },
  { key: 'education', label: 'Schools, teachers and students' },
  { key: 'election_participant', label: 'People who publish electoral material' },
  { key: 'data_centre', label: 'Data centre and AI infrastructure developers' },
  { key: 'any_organisation', label: 'Any organisation using AI' },
  { key: 'anyone', label: 'Everyone' },
] as const;

export type Audience = (typeof AUDIENCES)[number]['key'];

/** Audiences every reader belongs to, so the finder never asks about them. */
export const UNIVERSAL_AUDIENCES: readonly Audience[] = ['any_organisation', 'anyone'];

export type ScopeReview =
  | { status: 'draft'; draftedBy: string; draftedAt: string }
  | { status: 'reviewed'; draftedBy: string; draftedAt: string; reviewedBy: string; reviewedAt: string };

/** The instrument's own words on whom it covers, and where they are. */
export interface ScopeCitation {
  quote: string;
  /** Where the words sit in the instrument, such as "s 6" or "para 2". */
  pinpoint: string;
  url: string;
}

/**
 * One row of `data/rule-scope.json`. A record that sets no obligation for
 * anyone (a strategy, a report, a funding program) says so with a note
 * instead of an audience.
 */
export type RuleScope =
  | {
      policyId: string;
      kind: 'rule';
      legalForce: LegalForce;
      appliesTo: Audience[];
      scope: ScopeCitation;
      review: ScopeReview;
    }
  | { policyId: string; kind: 'not_a_rule'; note: string; review: ScopeReview };

export type Rule = Extract<RuleScope, { kind: 'rule' }>;

const LEGAL_FORCE_KEYS = new Set<string>(LEGAL_FORCES.map(({ key }) => key));
const AUDIENCE_KEYS = new Set<string>(AUDIENCES.map(({ key }) => key));

export function isAudience(value: string): value is Audience {
  return AUDIENCE_KEYS.has(value);
}

export function legalForceLabel(force: LegalForce): string {
  return LEGAL_FORCES.find(({ key }) => key === force)!.label;
}

export function audienceLabel(audience: Audience): string {
  return AUDIENCES.find(({ key }) => key === audience)!.label;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function calendarDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isValidCalendarDate(value))
    throw new Error(`${label} must be YYYY-MM-DD`);
  return value;
}

function parseReview(raw: unknown, label: string): ScopeReview {
  if (!isRecord(raw)) throw new Error(`${label}: review must be an object`);
  if (!nonEmpty(raw.draftedBy)) throw new Error(`${label}: review needs draftedBy`);
  const draftedAt = calendarDate(raw.draftedAt, `${label}: review.draftedAt`);
  if (raw.status === 'draft') return { status: 'draft', draftedBy: raw.draftedBy, draftedAt };
  if (raw.status === 'reviewed') {
    if (!nonEmpty(raw.reviewedBy)) throw new Error(`${label}: a reviewed scope needs reviewedBy`);
    const reviewedAt = calendarDate(raw.reviewedAt, `${label}: review.reviewedAt`);
    if (reviewedAt < draftedAt) throw new Error(`${label}: reviewedAt is before draftedAt`);
    return { status: 'reviewed', draftedBy: raw.draftedBy, draftedAt, reviewedBy: raw.reviewedBy, reviewedAt };
  }
  throw new Error(`${label}: review.status must be draft or reviewed`);
}

function parseCitation(raw: unknown, label: string): ScopeCitation {
  if (!isRecord(raw)) throw new Error(`${label}: scope must be an object`);
  if (!nonEmpty(raw.quote)) throw new Error(`${label}: scope needs the instrument's own words`);
  if (!nonEmpty(raw.pinpoint)) throw new Error(`${label}: scope needs a pinpoint`);
  if (typeof raw.url !== 'string' || !URL.canParse(raw.url) || new URL(raw.url).protocol !== 'https:')
    throw new Error(`${label}: scope.url must be an https URL`);
  return { quote: raw.quote.trim(), pinpoint: raw.pinpoint.trim(), url: raw.url };
}

/** Parses `data/rule-scope.json`, throwing on the first malformed entry. */
export function parseRuleScopes(raw: unknown): RuleScope[] {
  if (!Array.isArray(raw)) throw new Error('ruleScope: expected an array');
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`ruleScope[${index}]: expected an object`);
    const { policyId } = entry;
    if (!nonEmpty(policyId)) throw new Error(`ruleScope[${index}]: missing policyId`);
    const label = `ruleScope:${policyId}`;
    if (seen.has(policyId)) throw new Error(`${label}: duplicate policyId`);
    seen.add(policyId);
    const review = parseReview(entry.review, label);
    if (entry.kind === 'not_a_rule') {
      if (!nonEmpty(entry.note)) throw new Error(`${label}: not_a_rule needs a note`);
      return { policyId, kind: 'not_a_rule', note: entry.note, review };
    }
    if (entry.kind !== 'rule') throw new Error(`${label}: kind must be rule or not_a_rule`);
    if (typeof entry.legalForce !== 'string' || !LEGAL_FORCE_KEYS.has(entry.legalForce))
      throw new Error(`${label}: unknown legalForce ${String(entry.legalForce)}`);
    const { appliesTo } = entry;
    if (!Array.isArray(appliesTo) || appliesTo.length === 0)
      throw new Error(`${label}: appliesTo needs at least one audience`);
    for (const audience of appliesTo)
      if (typeof audience !== 'string' || !isAudience(audience))
        throw new Error(`${label}: unknown audience ${String(audience)}`);
    if (new Set(appliesTo).size !== appliesTo.length) throw new Error(`${label}: duplicate audience`);
    return {
      policyId,
      kind: 'rule',
      legalForce: entry.legalForce as LegalForce,
      appliesTo: appliesTo as Audience[],
      scope: parseCitation(entry.scope, label),
      review,
    };
  });
}

/**
 * Cross-file rules: every entry names a register record, nothing is
 * reviewed in the future, and a record still before Parliament or out for
 * comment cannot be called anything but proposed. Records without an entry
 * warn once as a count, so coverage grows without blocking other work.
 */
export function ruleScopeCoverage(
  scopes: readonly RuleScope[],
  policies: readonly Pick<Policy, 'id' | 'status'>[],
  now: Date = new Date(),
): { errors: string[]; warnings: string[] } {
  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const scoped = new Set(scopes.map((scope) => scope.policyId));
  const today = sydneyCalendarDate(now);
  const errors: string[] = [];
  for (const scope of scopes) {
    const label = `ruleScope:${scope.policyId}`;
    const policy = byId.get(scope.policyId);
    if (!policy) {
      errors.push(`${label}: no register record has this id`);
      continue;
    }
    const { review } = scope;
    if (review.draftedAt > today || (review.status === 'reviewed' && review.reviewedAt > today))
      errors.push(`${label}: review date is in the future (Australia/Sydney)`);
    if (scope.kind === 'rule' && policy.status === 'proposed' && scope.legalForce !== 'proposed')
      errors.push(`${label}: the record is proposed, so its legalForce must be proposed`);
  }
  const unscoped = policies.filter((policy) => !scoped.has(policy.id)).length;
  return {
    errors,
    warnings: unscoped > 0 ? [`ruleScope: ${unscoped} of ${policies.length} register records have no scope entry`] : [],
  };
}

/** What a reader told the finder: who they are and where they work. */
export interface FinderAnswers {
  audiences: ReadonlySet<Audience>;
  jurisdictions: ReadonlySet<Jurisdiction>;
}

/** Superseded, closed, repealed and trashed records bind nobody, so the finder skips them. */
const LIVE_STATUSES = new Set<PolicyStatus>(['proposed', 'active', 'amended']);

/** The fields of a register record the finder reads. */
export type FinderPolicy = Pick<Policy, 'id' | 'title' | 'jurisdiction' | 'status'>;

export interface FoundRule<P extends FinderPolicy = FinderPolicy> {
  policy: P;
  rule: Rule;
}

/**
 * Reviewed rules for a reader, grouped by legal force in LEGAL_FORCES order.
 * Federal records always count; a state record counts when the reader works
 * there. Only public records reach this function, so withheld records stay out.
 */
export function findRules<P extends FinderPolicy>(
  scopes: readonly RuleScope[],
  publicPolicies: readonly P[],
  answers: FinderAnswers,
): { force: LegalForce; rules: FoundRule<P>[] }[] {
  const byId = new Map(publicPolicies.map((policy) => [policy.id, policy]));
  const audiences = new Set<Audience>([...answers.audiences, ...UNIVERSAL_AUDIENCES]);
  const found = scopes.flatMap((rule): FoundRule<P>[] => {
    if (rule.kind !== 'rule' || rule.review.status !== 'reviewed') return [];
    const policy = byId.get(rule.policyId);
    if (!policy || !LIVE_STATUSES.has(policy.status)) return [];
    if (policy.jurisdiction !== 'federal' && !answers.jurisdictions.has(policy.jurisdiction)) return [];
    if (!rule.appliesTo.some((audience) => audiences.has(audience))) return [];
    return [{ policy, rule }];
  });
  return LEGAL_FORCES.map(({ key }) => ({
    force: key,
    rules: found
      .filter(({ rule }) => rule.legalForce === key)
      .sort((left, right) => left.policy.title.localeCompare(right.policy.title)),
  })).filter((group) => group.rules.length > 0);
}

export function reviewedRuleCount(scopes: readonly RuleScope[]): number {
  return scopes.filter((scope) => scope.kind === 'rule' && scope.review.status === 'reviewed').length;
}
