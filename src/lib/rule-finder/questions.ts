import { JURISDICTIONS, type Jurisdiction } from '@/types';
import { isAudience, type Audience, type FinderAnswers } from './scope';

export interface QuestionOption {
  label: string;
  audiences: readonly Audience[];
}

/**
 * One step of the finder. Each answer is a fact the reader already knows
 * about themselves; none asks whether they comply with anything.
 */
export type Question =
  | { id: 'where'; kind: 'jurisdictions'; prompt: string; hint: string }
  | { id: string; kind: 'choice'; prompt: string; hint: string; options: readonly QuestionOption[] };

const NO: QuestionOption = { label: 'No', audiences: [] };

function yesNo(id: string, prompt: string, hint: string, audience: Audience): Question {
  return {
    id,
    kind: 'choice',
    prompt,
    hint,
    options: [
      { label: 'Yes', audiences: [audience] },
      NO,
      // Showing a rule that may not apply is safer than hiding one that does.
      { label: 'Not sure', audiences: [audience] },
    ],
  };
}

export const QUESTIONS: readonly Question[] = [
  {
    id: 'where',
    kind: 'jurisdictions',
    prompt: 'Where do you work?',
    hint: 'Pick every state and territory you operate in. Commonwealth rules are always included.',
  },
  yesNo(
    'commonwealth',
    'Are you part of the Australian Government?',
    'A Commonwealth department, agency or other entity, or someone working for one.',
    'commonwealth_entity',
  ),
  yesNo(
    'state',
    'Are you part of a state or territory government?',
    'A state or territory department, agency or public sector body.',
    'state_entity',
  ),
  yesNo(
    'privacy',
    'Does the Privacy Act cover you?',
    'It covers Australian Government agencies, most businesses and not-for-profits with turnover over $3 million a year, and every health service provider.',
    'privacy_act_entity',
  ),
  yesNo(
    'finance',
    'Do you provide financial services?',
    'A bank, insurer or super fund, an Australian financial services or credit licensee, or a market participant.',
    'financial_services',
  ),
  yesNo(
    'online',
    'Do you run an online service, app or AI product used in Australia?',
    'A website, platform, app, chatbot or AI model that people in Australia can use.',
    'online_service',
  ),
  {
    id: 'courts',
    kind: 'choice',
    prompt: 'Do you work in courts or tribunals?',
    hint: 'Courts and tribunals set their own rules on using AI in proceedings.',
    options: [
      { label: 'As a lawyer or a party', audiences: ['court_user'] },
      { label: 'As a judge or tribunal member', audiences: ['judicial_officer'] },
      NO,
    ],
  },
  yesNo(
    'education',
    'Do you work or study in a school?',
    'A teacher, school leader or student.',
    'education',
  ),
  yesNo(
    'elections',
    'Do you publish political or electoral material?',
    'Advertising or other material about an election, a party or a candidate.',
    'election_participant',
  ),
  yesNo(
    'infrastructure',
    'Do you build or run data centres or AI infrastructure?',
    'Data centres, compute clusters or the energy and water supply behind them.',
    'data_centre',
  ),
];

export const STATE_JURISDICTIONS = JURISDICTIONS.filter((jurisdiction) => jurisdiction !== 'federal');

/** Answers live in the URL so a result can be shared and nothing is stored. */
export function encodeAnswers(answers: FinderAnswers): string {
  const params = new URLSearchParams();
  params.set('who', [...answers.audiences].sort().join(','));
  params.set('where', STATE_JURISDICTIONS.filter((code) => answers.jurisdictions.has(code)).join(','));
  return params.toString();
}

/** Reads answers back from a query string, or null when it holds none. */
export function decodeAnswers(search: string): FinderAnswers | null {
  const params = new URLSearchParams(search);
  const who = params.get('who');
  const where = params.get('where');
  if (who === null || where === null) return null;
  const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
  return {
    audiences: new Set(list(who).filter(isAudience)),
    jurisdictions: new Set(
      list(where).filter((code): code is Jurisdiction =>
        (STATE_JURISDICTIONS as readonly string[]).includes(code),
      ),
    ),
  };
}
