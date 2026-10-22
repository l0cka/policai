import type { Chamber, Dated, InstrumentEvent, LawEvent } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * Reads a Federal Register of Legislation title record from the register's
 * public OData API, which answers plain HTTP. The record gives registration,
 * a principal instrument's commencement, tabling in each House, the end of
 * each disallowance window once the register fixes it, disallowance and
 * repeal. An amending instrument's amendments commence in its principal's
 * versions, which this record does not show.
 *
 * A disallowance is a DisallowanceMotion event whose MotionOutcome is
 * DebatedAndAgreed; the register then also marks the title Repealed under
 * s 42 of the Legislation Act 2003, which is the same event, not a repeal.
 *
 * The API wants datetime literals without a zone, caps `$top` at 500, and
 * writes 9999-12-31 for a date it has not fixed yet ("TBC" on the website).
 */

const FRL_API = 'https://api.prod.legislation.gov.au/v1';
const FRL_SITE = 'https://www.legislation.gov.au';

export function frlTitleRecord(titleId: string): string {
  return `${FRL_API}/Titles('${titleId}')?$expand=parliamentaryScrutiny,parliamentaryScrutinySummary`;
}

const HOUSES: Record<string, Chamber> = { HouseOfReps: 'lower', Senate: 'upper' };

const MOTION_OUTCOMES: Record<string, string> = {
  DebatedAndNegatived: 'negatived',
  Expired: 'expired',
  Prorogued: 'lapsed on prorogation',
  Withdrawn: 'withdrawn',
};

interface FrlReason {
  markdown?: string | null;
  affectedByTitle?: { titleId?: string; name?: string; provisions?: string | null } | null;
}

interface FrlTitle {
  id: string;
  name: string;
  isPrincipal?: boolean;
  asMadeRegisteredAt: string | null;
  statusHistory?: { status: string; start: string; reasons?: FrlReason[] }[];
  parliamentaryScrutiny?: {
    id?: number;
    eventType: string;
    eventDate: string | null;
    house: string;
    isProrogueReTable?: boolean;
    disallowanceMotionSponsor?: string | null;
    disallowanceMotionOutcomeId?: number | null;
    motionOutcomeType?: string | null;
  }[];
  parliamentaryScrutinySummary?: {
    lastDateForDisallowanceInHoR?: string | null;
    lastDateForDisallowanceInSenate?: string | null;
  } | null;
}

/** "2026-09-17T14:54:38.03" → "2026-09-17"; the register's placeholder year 9999 → null. */
function day(value: string | null | undefined): string | null {
  const match = value ? /^(\d{4})-\d{2}-\d{2}/.exec(value) : null;
  return match && match[1] !== '9999' ? match[0] : null;
}

function parseTitle(json: string): FrlTitle {
  const raw: unknown = JSON.parse(json);
  if (!raw || typeof raw !== 'object' || typeof (raw as FrlTitle).id !== 'string' || typeof (raw as FrlTitle).name !== 'string') {
    throw new Error('the Federal Register response is not a title record');
  }
  return raw as FrlTitle;
}

export function parseFrlTitle(json: string): RegisterReading<InstrumentEvent | LawEvent> {
  const title = parseTitle(json);
  const source = { url: `${FRL_SITE}/${title.id}/asmade/details`, title: title.name };
  const dated: { date: string; event: InstrumentEvent | LawEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];

  const registered = day(title.asMadeRegisteredAt);
  if (registered) dated.push({ date: registered, event: { kind: 'registered' } });

  const summary = title.parliamentaryScrutinySummary;
  const windowEnds: Record<Chamber, string | null> = {
    lower: day(summary?.lastDateForDisallowanceInHoR),
    upper: day(summary?.lastDateForDisallowanceInSenate),
  };
  const scrutiny = title.parliamentaryScrutiny ?? [];
  const tabled = new Set<Chamber>();
  let disallowedOn: string | null = null;
  for (const item of scrutiny) {
    const chamber = HOUSES[item.house] ?? null;
    const date = day(item.eventDate);
    if (!date) continue;
    if (item.eventType === 'Tabled' && chamber) {
      // A re-tabling after prorogation restarts the clock but is not a second tabling.
      if (tabled.has(chamber)) continue;
      tabled.add(chamber);
      const disallowanceEnds = windowEnds[chamber];
      dated.push({ date, event: { kind: 'tabled', chamber, ...(disallowanceEnds ? { disallowanceEnds } : {}) } });
    } else if (item.eventType === 'DisallowanceMotion') {
      const outcome = scrutiny.find((other) => other.eventType === 'MotionOutcome' && other.id === item.disallowanceMotionOutcomeId);
      const decidedOn = day(outcome?.eventDate);
      if (outcome?.motionOutcomeType === 'DebatedAndAgreed' && decidedOn && chamber) {
        disallowedOn = decidedOn;
        dated.push({ date: decidedOn, event: { kind: 'disallowed', chamber } });
      } else {
        const sponsor = item.disallowanceMotionSponsor ? ` by ${item.disallowanceMotionSponsor}` : '';
        const result = outcome?.motionOutcomeType ? `, ${MOTION_OUTCOMES[outcome.motionOutcomeType] ?? outcome.motionOutcomeType}` : '';
        unrecognised.push({ chamber, stage: `Notice of a disallowance motion${sponsor}${result}`, date });
      }
    } else if (item.eventType !== 'MotionOutcome') {
      unrecognised.push({ chamber, stage: item.eventType, date });
    }
  }

  const commenced =
    (title.statusHistory ?? [])
      .filter((entry) => entry.status === 'InForce')
      .map((entry) => day(entry.start))
      .filter((date): date is string => date !== null)
      .sort()[0] ?? null;
  if (title.isPrincipal && commenced) dated.push({ date: commenced, event: { kind: 'commenced', extent: 'full' } });

  for (const entry of title.statusHistory ?? []) {
    const date = day(entry.start);
    if (!date || entry.status === 'InForce') continue;
    if (disallowedOn && entry.status === 'Repealed' && entry.reasons?.some(isDisallowanceRepeal)) continue;
    if (entry.status === 'Repealed') {
      const by = entry.reasons?.map((reason) => reasonText(reason)).find(Boolean) ?? 'repeal recorded on the Federal Register';
      dated.push({ date, event: { kind: 'repealed', by } });
    } else {
      unrecognised.push({ chamber: null, stage: entry.status, date });
    }
  }

  return {
    title: title.name,
    events: dated
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }): Dated<InstrumentEvent | LawEvent> => ({ date, precision: 'day', event, source })),
    unrecognised,
  };
}

/** "s 48A of the [Legislation Act 2003](/C2004A01224)" → "s 48A of the Legislation Act 2003". */
function reasonText(reason: FrlReason): string | null {
  const affecting = reason.affectedByTitle;
  if (affecting?.name) return [affecting.provisions, affecting.name].filter(Boolean).join(' of the ');
  return reason.markdown ? reason.markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') : null;
}

/** s 42 of the Legislation Act 2003 repeals a disallowed instrument; the register records that as a repeal. */
function isDisallowanceRepeal(reason: FrlReason): boolean {
  const by = reason.affectedByTitle;
  return by?.titleId === 'C2004A01224' && by.provisions?.trim() === 's 42';
}
