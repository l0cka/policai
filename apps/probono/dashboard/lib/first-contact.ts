export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type State = (typeof STATES)[number];

export const PROBLEMS = [
  'family_violence',
  'family_law',
  'child_protection',
  'criminal',
  'fines',
  'tenancy',
  'debt',
  'employment',
  'discrimination',
  'immigration',
  'social_security',
  'wills_and_estates',
  'consumer',
  'general',
] as const;
export type Problem = (typeof PROBLEMS)[number];

export const KINDS = [
  'legal_aid_commission',
  'legal_aid_helpline',
  'clc',
  'fvpls',
  'atsils',
  'national',
] as const;
export type Kind = (typeof KINDS)[number];

export const LEVELS = ['local', 'state', 'national'] as const;
export type Level = (typeof LEVELS)[number];

export const CULTURAL_FOCUS = ['aboriginal_torres_strait_islander', 'family_violence', 'under_18'] as const;
const GATED_FOCUS: readonly CulturalFocus[] = ['aboriginal_torres_strait_islander', 'under_18'];
export type CulturalFocus = (typeof CULTURAL_FOCUS)[number];

export type Provenance = { url: string; checked: string };

export type Service = {
  id: string;
  name: string;
  organisation?: string;
  kind: Kind;
  level: Level;
  states: State[];
  catchment?: { statewide?: boolean; postcodes?: string[]; lgas?: string[] };
  problems?: Problem[];
  intake?: { phone?: string; url?: string; hours?: string };
  eligibility?: string;
  languages?: string[];
  cultural?: CulturalFocus[];
  bring?: string[];
  provenance: Record<string, Provenance>;
  review: 'unreviewed' | 'reviewed';
};

export type Query = {
  state: State;
  postcode?: string;
  lga?: string;
  problem: Problem;
  circumstances?: {
    aboriginal_torres_strait_islander?: boolean;
    family_violence?: boolean;
    under_18?: boolean;
    language?: string;
  };
};

export type Referral = {
  rank: number;
  tier: 'specific' | 'state' | 'national';
  id: string;
  name: string;
  kind: Kind;
  phone?: string;
  url?: string;
  hours?: string;
  eligibility?: string;
  bring?: string[];
  languages?: string[];
  why: string;
  source: string;
  sources: Record<string, Provenance>;
  checked: string;
};

export type Result = {
  status: 'ok' | 'no_match' | 'none_reviewed';
  services: Referral[];
  notice: string;
};

export const NOTICE =
  'This is a referral, not legal advice. Contact the service to check whether it can help with your situation.';

export const MAX_RESULTS = 5;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const POSTCODE = /^\d{4}$/;
const POSTCODE_RANGE = /^(\d{4})-(\d{4})$/;

const PROVENANCE_FIELDS = [
  'organisation',
  'catchment',
  'problems',
  'intake.phone',
  'intake.url',
  'intake.hours',
  'eligibility',
  'languages',
  'cultural',
  'bring',
] as const;

function isCalendarDate(value: string, today: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= today;
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function populated(service: Service, field: (typeof PROVENANCE_FIELDS)[number]): boolean {
  switch (field) {
    case 'organisation':
      return service.organisation !== undefined;
    case 'catchment':
      return service.catchment !== undefined;
    case 'problems':
      return service.problems !== undefined;
    case 'intake.phone':
      return service.intake?.phone !== undefined;
    case 'intake.url':
      return service.intake?.url !== undefined;
    case 'intake.hours':
      return service.intake?.hours !== undefined;
    case 'eligibility':
      return service.eligibility !== undefined;
    case 'languages':
      return service.languages !== undefined;
    case 'cultural':
      return service.cultural !== undefined;
    case 'bring':
      return service.bring !== undefined;
  }
}

export function validateServices(services: Service[], today: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of services) {
    const at = (message: string) => errors.push(`${s.id ?? '(no id)'}: ${message}`);
    if (typeof s.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) at('id must be kebab-case');
    if (seen.has(s.id)) at('duplicate id');
    seen.add(s.id);
    if (!s.name) at('name is required');
    if (!KINDS.includes(s.kind)) at(`unknown kind ${s.kind}`);
    if (!LEVELS.includes(s.level)) at(`unknown level ${s.level}`);
    if (!Array.isArray(s.states) || s.states.length === 0 || s.states.some((x) => !STATES.includes(x)))
      at('states must be a non-empty list of state codes');
    if (s.review !== 'unreviewed' && s.review !== 'reviewed') at('review must be unreviewed or reviewed');
    for (const p of s.problems ?? []) if (!PROBLEMS.includes(p)) at(`unknown problem ${p}`);
    for (const c of s.cultural ?? []) if (!CULTURAL_FOCUS.includes(c)) at(`unknown cultural focus ${c}`);
    const c = s.catchment;
    if (c) {
      for (const code of c.postcodes ?? []) {
        const range = POSTCODE_RANGE.exec(code);
        if (!POSTCODE.test(code) && !(range && Number(range[1]) <= Number(range[2])))
          at(`bad postcode or range ${code}`);
      }
      if (!c.statewide && !(c.postcodes?.length || c.lgas?.length)) at('catchment is empty');
    }
    if (s.level === 'local' && (!c || c.statewide || !(c.postcodes?.length || c.lgas?.length)))
      at('a local service needs a postcode or LGA catchment');
    if (s.intake?.phone !== undefined && !/\d/.test(s.intake.phone)) at('phone has no digits');
    if (s.intake?.url !== undefined && !isHttps(s.intake.url)) at('intake.url must be https');
    for (const field of PROVENANCE_FIELDS) {
      const p = s.provenance?.[field];
      if (populated(s, field)) {
        if (!p) at(`${field} has no provenance`);
        else {
          if (!isHttps(p.url)) at(`${field} provenance url must be https`);
          if (!isCalendarDate(p.checked, today)) at(`${field} provenance date ${p.checked} is not a past calendar date`);
        }
      } else if (p) at(`${field} has provenance but no value`);
    }
    for (const key of Object.keys(s.provenance ?? {}))
      if (!(PROVENANCE_FIELDS as readonly string[]).includes(key)) at(`unknown provenance key ${key}`);
  }
  return errors;
}

const CIRCUMSTANCE_KEYS = ['aboriginal_torres_strait_islander', 'family_violence', 'under_18', 'language'];

export function parseQuery(input: unknown): { query: Query } | { error: string } {
  if (typeof input !== 'object' || input === null) return { error: 'query must be an object' };
  const raw = input as Record<string, unknown>;
  const state = typeof raw.state === 'string' ? (raw.state.toUpperCase() as State) : undefined;
  if (!state || !STATES.includes(state)) return { error: `state must be one of ${STATES.join(', ')}` };
  const problem = raw.problem as Problem;
  if (!PROBLEMS.includes(problem)) return { error: `problem must be one of ${PROBLEMS.join(', ')}` };
  const query: Query = { state, problem };
  if (raw.postcode !== undefined && raw.postcode !== '') {
    if (typeof raw.postcode !== 'string' || !POSTCODE.test(raw.postcode))
      return { error: 'postcode must be four digits' };
    query.postcode = raw.postcode;
  }
  if (raw.lga !== undefined && raw.lga !== '') {
    if (typeof raw.lga !== 'string' || raw.lga.length > 80) return { error: 'lga must be a name of at most 80 characters' };
    query.lga = raw.lga;
  }
  const circ = raw.circumstances;
  if (circ !== undefined) {
    if (typeof circ !== 'object' || circ === null || Array.isArray(circ)) return { error: 'circumstances must be an object' };
    const c = circ as Record<string, unknown>;
    const unknown = Object.keys(c).filter((k) => !CIRCUMSTANCE_KEYS.includes(k));
    if (unknown.length) return { error: `unknown circumstances: ${unknown.join(', ')}` };
    const out: NonNullable<Query['circumstances']> = {};
    if (c.aboriginal_torres_strait_islander !== undefined) {
      if (typeof c.aboriginal_torres_strait_islander !== 'boolean')
        return { error: 'aboriginal_torres_strait_islander must be true or false' };
      out.aboriginal_torres_strait_islander = c.aboriginal_torres_strait_islander;
    }
    if (c.family_violence !== undefined) {
      if (typeof c.family_violence !== 'boolean') return { error: 'family_violence must be true or false' };
      out.family_violence = c.family_violence;
    }
    if (c.under_18 !== undefined) {
      if (typeof c.under_18 !== 'boolean') return { error: 'under_18 must be true or false' };
      out.under_18 = c.under_18;
    }
    if (c.language !== undefined) {
      if (typeof c.language !== 'string' || c.language.length > 60) return { error: 'language must be a name of at most 60 characters' };
      out.language = c.language;
    }
    query.circumstances = out;
  }
  return { query };
}

function postcodeIn(postcode: string, entries: string[]): boolean {
  const n = Number(postcode);
  return entries.some((e) => {
    const range = POSTCODE_RANGE.exec(e);
    return range ? n >= Number(range[1]) && n <= Number(range[2]) : e === postcode;
  });
}

function catchmentSize(s: Service): number {
  if (s.catchment?.statewide) return Infinity;
  const postcodes = (s.catchment?.postcodes ?? []).reduce((sum, e) => {
    const range = POSTCODE_RANGE.exec(e);
    return sum + (range ? Number(range[2]) - Number(range[1]) + 1 : 1);
  }, 0);
  return postcodes + (s.catchment?.lgas?.length ?? 0) * 1000;
}

function compareSize(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function catchmentMatches(s: Service, q: Query): boolean {
  const c = s.catchment;
  if (!c) return false;
  if (c.statewide) return true;
  if (q.postcode && c.postcodes && postcodeIn(q.postcode, c.postcodes)) return true;
  if (q.lga && c.lgas?.some((l) => l.toLowerCase() === q.lga!.toLowerCase())) return true;
  return false;
}

function culturalMatch(s: Service, q: Query): boolean {
  const c = q.circumstances;
  if (!c || !s.cultural?.length) return false;
  const gates = s.cultural.filter((f) => GATED_FOCUS.includes(f));
  if (gates.length) {
    if (s.kind === 'fvpls' && c.family_violence !== true && q.problem !== 'family_violence') return false;
    return gates.every((f) => c[f as 'aboriginal_torres_strait_islander' | 'under_18'] === true);
  }
  return c.family_violence === true && s.cultural.includes('family_violence');
}

type Tiered = { service: Service; tier: Referral['tier']; group: number; why: string };

function classify(s: Service, q: Query): Tiered | null {
  if (!s.states.includes(q.state)) return null;
  const problems = s.problems ?? ['general'];
  if (!problems.includes(q.problem) && !problems.includes('general')) return null;
  const gates = (s.cultural ?? []).filter((f) => GATED_FOCUS.includes(f));
  if (gates.length && !culturalMatch(s, q)) return null;
  if (s.level === 'national') return { service: s, tier: 'national', group: 3, why: 'National service for this kind of problem.' };
  if (!catchmentMatches(s, q)) return null;
  if (culturalMatch(s, q))
    return { service: s, tier: 'specific', group: 0, why: 'Specialist service that matches the circumstances given.' };
  if (s.level === 'local') {
    return { service: s, tier: 'specific', group: 1, why: 'Local service whose catchment includes the place given.' };
  }
  return { service: s, tier: 'state', group: 2, why: 'State legal aid service.' };
}

function exactness(s: Service, q: Query): number {
  return s.problems?.includes(q.problem) ? 0 : 1;
}

function oldest(dates: string[]): string {
  return dates.reduce((a, b) => (b < a ? b : a));
}

function toReferral(t: Tiered, rank: number): Referral {
  const s = t.service;
  const shown = ['intake.phone', 'intake.url', 'intake.hours', 'eligibility', 'bring', 'languages'] as const;
  const used = shown.map((f) => s.provenance[f]).filter((p): p is Provenance => p !== undefined);
  const fallback = Object.values(s.provenance);
  const basis = used.length ? used : fallback;
  const sourceOf = (s.provenance['intake.url'] ?? basis[0])?.url ?? s.intake?.url ?? '';
  const sources: Record<string, Provenance> = {};
  for (const f of shown) {
    const p = s.provenance[f];
    if (p !== undefined) sources[f] = p;
  }
  const referral: Referral = {
    rank,
    tier: t.tier,
    id: s.id,
    name: s.name,
    kind: s.kind,
    why: t.why,
    source: sourceOf,
    sources,
    checked: basis.length ? oldest(basis.map((p) => p.checked)) : '',
  };
  if (s.intake?.phone !== undefined) referral.phone = s.intake.phone;
  if (s.intake?.url !== undefined) referral.url = s.intake.url;
  if (s.intake?.hours !== undefined) referral.hours = s.intake.hours;
  if (s.eligibility !== undefined) referral.eligibility = s.eligibility;
  if (s.bring !== undefined) referral.bring = s.bring;
  if (s.languages !== undefined) referral.languages = s.languages;
  return referral;
}

export function findFirstContact(
  services: Service[],
  query: Query,
  options: { includeUnreviewed?: boolean } = {},
): Result {
  const pool = services.filter((s) => options.includeUnreviewed || s.review === 'reviewed');
  const ranked = pool
    .map((s) => classify(s, query))
    .filter((t): t is Tiered => t !== null)
    .sort(
      (a, b) =>
        a.group - b.group ||
        exactness(a.service, query) - exactness(b.service, query) ||
        compareSize(catchmentSize(a.service), catchmentSize(b.service)) ||
        a.service.name.localeCompare(b.service.name, 'en-AU'),
    )
    .slice(0, MAX_RESULTS)
    .map((t, i) => toReferral(t, i + 1));
  const status = ranked.length ? 'ok' : pool.some((s) => s.states.includes(query.state)) ? 'no_match' : 'none_reviewed';
  return { status, services: ranked, notice: NOTICE };
}

export const TOOL_NAME = 'find_first_contact';

export const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    'Find the Australian legal service to contact first for a problem, by state and postcode. Returns service name, phone, hours, what to bring, the source page and the date it was last checked. It is a referral lookup and gives no legal advice.',
  inputSchema: {
    type: 'object',
    properties: {
      state: { type: 'string', enum: [...STATES], description: 'State or territory code.' },
      postcode: { type: 'string', pattern: '^\\d{4}$', description: 'Four-digit postcode, optional.' },
      lga: { type: 'string', maxLength: 80, description: 'Local government area name, optional.' },
      problem: { type: 'string', enum: [...PROBLEMS], description: 'Kind of legal problem.' },
      circumstances: {
        type: 'object',
        properties: {
          aboriginal_torres_strait_islander: { type: 'boolean' },
          family_violence: { type: 'boolean' },
          under_18: { type: 'boolean' },
          language: { type: 'string', maxLength: 60 },
        },
        additionalProperties: false,
      },
    },
    required: ['state', 'problem'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
} as const;
