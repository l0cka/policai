import {
  DATE_PRECISIONS,
  JURISDICTIONS,
  type DatePrecision,
  type Jurisdiction,
  type Policy,
  type PolicyStatus,
  type SourceEvidence,
} from '@/types';
import { isValidCalendarDate } from '@/lib/calendar-date';

/**
 * Lifecycle of a bill, Act or legislative instrument. The dated events are
 * the canonical record; status and phase are derived by replaying them
 * through `step`, which is the only place the legal order is encoded.
 */

export type Chamber = 'lower' | 'upper';

export type OfficialRef =
  | { register: 'aph'; billId: string }
  | { register: 'frl'; titleId: string }
  | { register: 'state'; jurisdiction: Exclude<Jurisdiction, 'federal'>; url: string };

export type BillEvent =
  | { kind: 'introduced'; chamber: Chamber }
  | { kind: 'referred'; committee: string; inquiryUrl: string; reportDue?: string }
  | { kind: 'reported'; committee: string; reportUrl: string }
  | { kind: 'passed'; chamber: Chamber; withAmendments: boolean }
  | { kind: 'assented'; actCitation: string; act?: OfficialRef }
  | { kind: 'lapsed' }
  | { kind: 'withdrawn' }
  | { kind: 'negatived'; chamber: Chamber };

export type InstrumentEvent =
  | { kind: 'registered' }
  | { kind: 'tabled'; chamber: Chamber; disallowanceEnds?: string }
  | { kind: 'disallowed'; chamber: Chamber };

export type LawEvent =
  | { kind: 'commenced'; extent: 'full' | 'partial'; note?: string }
  | { kind: 'amended'; by: string; byPolicyId?: string }
  | { kind: 'repealed'; by: string };

export type LegislativeEvent = BillEvent | InstrumentEvent | LawEvent;

export interface Dated<E> {
  date: string;
  precision: DatePrecision;
  event: E;
  source: SourceEvidence;
}

export type Legislative =
  | {
      kind: 'bill';
      ref: OfficialRef;
      origin: 'government' | 'private_member';
      events: Dated<BillEvent | LawEvent>[];
    }
  | {
      kind: 'instrument';
      ref: OfficialRef;
      issuerBodyId: string;
      enablingAct: string;
      events: Dated<InstrumentEvent | LawEvent>[];
    };

export type LegislativePhase =
  | 'before_parliament'
  | 'made'
  | 'in_force'
  | 'ended'
  | 'repealed';

const UNICAMERAL: ReadonlySet<Jurisdiction> = new Set(['qld', 'act', 'nt']);

export function chambersOf(jurisdiction: Jurisdiction): readonly Chamber[] {
  return UNICAMERAL.has(jurisdiction) ? ['lower'] : ['lower', 'upper'];
}

interface ReplayState {
  phase: LegislativePhase | null;
  passed: ReadonlySet<Chamber>;
  tabled: ReadonlySet<Chamber>;
  referred: number;
  reported: number;
  fullyCommenced: boolean;
}

const INITIAL: ReplayState = {
  phase: null,
  passed: new Set(),
  tabled: new Set(),
  referred: 0,
  reported: 0,
  fullyCommenced: false,
};

type Step = ReplayState | string;

function step(
  state: ReplayState,
  event: LegislativeEvent,
  kind: Legislative['kind'],
  jurisdiction: Jurisdiction,
): Step {
  const chambers = chambersOf(jurisdiction);
  const { phase } = state;
  const inParliament = phase === 'before_parliament';
  const made = phase === 'made' || phase === 'in_force';

  switch (event.kind) {
    case 'introduced':
      if (kind !== 'bill') return 'only a bill is introduced';
      if (phase !== null) return 'introduced must be the first event';
      if (!chambers.includes(event.chamber)) return `${jurisdiction} has no ${event.chamber} chamber`;
      return { ...state, phase: 'before_parliament' };
    case 'referred':
      if (!inParliament) return 'a bill is referred only while before Parliament';
      return { ...state, referred: state.referred + 1 };
    case 'reported':
      if (!inParliament) return 'a committee reports only while the bill is before Parliament';
      if (state.reported >= state.referred) return 'reported needs an earlier referral';
      return { ...state, reported: state.reported + 1 };
    case 'passed':
      if (!inParliament) return 'a bill passes only while before Parliament';
      if (!chambers.includes(event.chamber)) return `${jurisdiction} has no ${event.chamber} chamber`;
      if (state.passed.has(event.chamber)) return `already passed the ${event.chamber} chamber`;
      return { ...state, passed: new Set([...state.passed, event.chamber]) };
    case 'assented':
      if (!inParliament) return 'assent needs a bill before Parliament';
      if (chambers.some((chamber) => !state.passed.has(chamber))) {
        return 'assent needs the bill to pass every chamber';
      }
      return { ...state, phase: 'made' };
    case 'lapsed':
    case 'withdrawn':
      if (!inParliament) return `a bill is ${event.kind} only while before Parliament`;
      return { ...state, phase: 'ended' };
    case 'negatived':
      if (!inParliament) return 'a bill is negatived only while before Parliament';
      if (!chambers.includes(event.chamber)) return `${jurisdiction} has no ${event.chamber} chamber`;
      return { ...state, phase: 'ended' };
    case 'registered':
      if (kind !== 'instrument') return 'only an instrument is registered';
      if (phase !== null) return 'registered must be the first event';
      return { ...state, phase: 'made' };
    case 'tabled':
      if (kind !== 'instrument') return 'only an instrument is tabled';
      if (!made) return 'an instrument is tabled only once registered';
      if (!chambers.includes(event.chamber)) return `${jurisdiction} has no ${event.chamber} chamber`;
      if (state.tabled.has(event.chamber)) return `already tabled in the ${event.chamber} chamber`;
      return { ...state, tabled: new Set([...state.tabled, event.chamber]) };
    case 'disallowed':
      if (!made) return 'only a registered instrument is disallowed';
      if (!state.tabled.has(event.chamber)) return `disallowed needs tabling in the ${event.chamber} chamber`;
      return { ...state, phase: 'ended' };
    case 'commenced':
      if (!made) return 'commencement needs an assented Act or a registered instrument';
      if (state.fullyCommenced) return 'already fully commenced';
      return { ...state, phase: 'in_force', fullyCommenced: event.extent === 'full' };
    case 'amended':
      if (phase !== 'in_force') return 'only a commenced law is amended';
      return state;
    case 'repealed':
      if (!made) return 'only a made law is repealed';
      return { ...state, phase: 'repealed' };
  }
}

const FIRST_EVENT: Record<Legislative['kind'], string> = {
  bill: 'introduced',
  instrument: 'registered',
};

function replay(
  legislative: Legislative,
  jurisdiction: Jurisdiction,
): { phase: LegislativePhase | null; errors: string[] } {
  const errors: string[] = [];
  let state = INITIAL;
  let previousDate = '';
  legislative.events.forEach((dated, index) => {
    if (dated.date < previousDate) errors.push(`events[${index}]: dated before the event above it`);
    previousDate = dated.date;
    if (index === 0 && dated.event.kind !== FIRST_EVENT[legislative.kind]) {
      errors.push(`events[0]: a ${legislative.kind} starts with ${FIRST_EVENT[legislative.kind]}`);
      return;
    }
    if (state.phase === 'ended' || state.phase === 'repealed') {
      errors.push(`events[${index}] ${dated.event.kind}: nothing follows ${state.phase}`);
      return;
    }
    const next = step(state, dated.event, legislative.kind, jurisdiction);
    if (typeof next === 'string') {
      errors.push(`events[${index}] ${dated.event.kind}: ${next}`);
      return;
    }
    state = next;
  });
  return { phase: state.phase, errors };
}

const STATUS_OF_PHASE: Record<LegislativePhase, PolicyStatus> = {
  before_parliament: 'proposed',
  made: 'active',
  in_force: 'active',
  ended: 'closed',
  repealed: 'repealed',
};

/**
 * Register status for a legislative record. An assented Act is active before
 * it commences, matching the register's existing convention: the status pill
 * says "Not yet in effect" while its commenced date is in the future.
 */
export function legislativeStatus(
  legislative: Legislative,
  jurisdiction: Jurisdiction,
): PolicyStatus | null {
  const { phase, errors } = replay(legislative, jurisdiction);
  return phase && errors.length === 0 ? STATUS_OF_PHASE[phase] : null;
}

// Parsing: data/policies.json is untrusted at this boundary.

type Raw = Record<string, unknown>;

const APH_BILL_ID = /^[rs]\d+$/;
const FRL_TITLE_ID = /^[CF]\d{4}[A-Z]\d{5}$/;

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttps(value: unknown): value is string {
  if (!isText(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidCalendarDate(value);
}

function isChamber(value: unknown): value is Chamber {
  return value === 'lower' || value === 'upper';
}

function refErrors(ref: unknown): string[] {
  if (!isRaw(ref)) return ['ref must be an object'];
  switch (ref.register) {
    case 'aph':
      return APH_BILL_ID.test(String(ref.billId)) ? [] : [`ref.billId "${ref.billId}" is not an APH bill id`];
    case 'frl':
      return FRL_TITLE_ID.test(String(ref.titleId)) ? [] : [`ref.titleId "${ref.titleId}" is not a Federal Register title id`];
    case 'state':
      return [
        ...((JURISDICTIONS as readonly unknown[]).includes(ref.jurisdiction) && ref.jurisdiction !== 'federal'
          ? []
          : [`ref.jurisdiction "${ref.jurisdiction}" is not a state or territory`]),
        ...(isHttps(ref.url) ? [] : ['ref.url must be an https URL']),
      ];
    default:
      return [`ref.register "${ref.register}" is not aph, frl or state`];
  }
}

const EVENT_FIELDS: Record<LegislativeEvent['kind'], (event: Raw) => string[]> = {
  introduced: (e) => (isChamber(e.chamber) ? [] : ['chamber must be lower or upper']),
  referred: (e) => [
    ...(isText(e.committee) ? [] : ['committee is required']),
    ...(isHttps(e.inquiryUrl) ? [] : ['inquiryUrl must be an https URL']),
    ...(e.reportDue === undefined || isDate(e.reportDue) ? [] : ['reportDue must be YYYY-MM-DD']),
  ],
  reported: (e) => [
    ...(isText(e.committee) ? [] : ['committee is required']),
    ...(isHttps(e.reportUrl) ? [] : ['reportUrl must be an https URL']),
  ],
  passed: (e) => [
    ...(isChamber(e.chamber) ? [] : ['chamber must be lower or upper']),
    ...(typeof e.withAmendments === 'boolean' ? [] : ['withAmendments must be true or false']),
  ],
  assented: (e) => [
    ...(isText(e.actCitation) ? [] : ['actCitation is required']),
    ...(e.act === undefined ? [] : refErrors(e.act).map((error) => `act.${error}`)),
  ],
  lapsed: () => [],
  withdrawn: () => [],
  negatived: (e) => (isChamber(e.chamber) ? [] : ['chamber must be lower or upper']),
  registered: () => [],
  tabled: (e) => [
    ...(isChamber(e.chamber) ? [] : ['chamber must be lower or upper']),
    ...(e.disallowanceEnds === undefined || isDate(e.disallowanceEnds) ? [] : ['disallowanceEnds must be YYYY-MM-DD']),
  ],
  disallowed: (e) => (isChamber(e.chamber) ? [] : ['chamber must be lower or upper']),
  commenced: (e) => (e.extent === 'full' || e.extent === 'partial' ? [] : ['extent must be full or partial']),
  amended: (e) => [
    ...(isText(e.by) ? [] : ['by is required']),
    ...(e.byPolicyId === undefined || isText(e.byPolicyId) ? [] : ['byPolicyId must be a policy id']),
  ],
  repealed: (e) => (isText(e.by) ? [] : ['by is required']),
};

function datedErrors(dated: unknown): string[] {
  if (!isRaw(dated)) return ['must be an object'];
  const errors: string[] = [];
  if (!isDate(dated.date)) errors.push(`date "${dated.date}" must be YYYY-MM-DD`);
  if (!(DATE_PRECISIONS as readonly unknown[]).includes(dated.precision)) {
    errors.push(`precision "${dated.precision}" must be day, month or year`);
  }
  if (!isRaw(dated.source) || !isHttps(dated.source.url)) errors.push('source.url must be an https URL');
  const event = dated.event;
  if (!isRaw(event) || typeof event.kind !== 'string' || !Object.hasOwn(EVENT_FIELDS, event.kind)) {
    errors.push(`event.kind "${isRaw(event) ? event.kind : event}" is not a lifecycle event`);
    return errors;
  }
  const fields = EVENT_FIELDS[event.kind as LegislativeEvent['kind']];
  return [...errors, ...fields(event).map((error) => `${event.kind}: ${error}`)];
}

function shapeErrors(raw: unknown): string[] {
  if (!isRaw(raw)) return ['must be an object'];
  const errors: string[] = [];
  if (raw.kind === 'bill') {
    if (raw.origin !== 'government' && raw.origin !== 'private_member') {
      errors.push('origin must be government or private_member');
    }
  } else if (raw.kind === 'instrument') {
    if (!isText(raw.issuerBodyId)) errors.push('issuerBodyId is required');
    if (!isText(raw.enablingAct)) errors.push('enablingAct is required');
  } else {
    return [`kind "${raw.kind}" must be bill or instrument`];
  }
  errors.push(...refErrors(raw.ref));
  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    errors.push('events must list at least one event');
  } else {
    raw.events.forEach((dated, index) => {
      errors.push(...datedErrors(dated).map((error) => `events[${index}]: ${error}`));
    });
  }
  return errors;
}

const LAW_DATE_TYPES = ['commenced', 'amended', 'repealed'] as const;

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

/**
 * Every problem with a register record's `legislative` field: its shape, the
 * order of its events, a stored status that disagrees with them, and a
 * commencement, amendment or repeal event without the matching record date.
 */
export function legislativeErrors(
  policy: Pick<Policy, 'type' | 'status' | 'jurisdiction' | 'dates'> & { legislative?: unknown },
): string[] {
  if (policy.legislative === undefined) return [];
  if (policy.type !== 'legislation' && policy.type !== 'regulation') {
    return [`legislative is only for legislation or regulation records, not "${policy.type}"`];
  }
  const shape = shapeErrors(policy.legislative).map((error) => `legislative: ${error}`);
  if (shape.length > 0) return shape;
  // SAFETY: shapeErrors accepted every field the model reads.
  const legislative = policy.legislative as Legislative;

  const { phase, errors } = replay(legislative, policy.jurisdiction);
  const result = errors.map((error) => `legislative.${error}`);
  if (result.length === 0 && phase) {
    const expected = STATUS_OF_PHASE[phase];
    const allowed =
      policy.status === expected ||
      policy.status === 'trashed' ||
      (policy.status === 'superseded' && expected === 'active');
    if (!allowed) {
      result.push(`status "${policy.status}" disagrees with its lifecycle events, which make it "${expected}"`);
    }
  }

  const recordDates = new Set(
    (policy.dates ?? []).map((date) => `${date.type}:${dateOnly(date.date)}`),
  );
  legislative.events.forEach((dated, index) => {
    const type = LAW_DATE_TYPES.find((candidate) => candidate === dated.event.kind);
    if (type && !recordDates.has(`${type}:${dated.date}`)) {
      result.push(`legislative.events[${index}] ${type} on ${dated.date} has no matching "${type}" record date`);
    }
  });
  return result;
}
