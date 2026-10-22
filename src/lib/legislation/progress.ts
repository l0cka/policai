import type { DatePrecision, Jurisdiction, Policy } from '@/types';
import { formatPolicyDate } from '@/lib/format-policy-date';
import {
  chambersOf,
  legislativeStatus,
  type Chamber,
  type Legislative,
  type LegislativeEvent,
} from './model';

export type ProgressStep =
  | { state: 'done'; label: string; detail?: string; date: string; precision: DatePrecision; sourceUrl: string }
  | { state: 'next'; label: string; date?: string };

type House = Record<Chamber, string>;

const BICAMERAL_STATE: House = { lower: 'Legislative Assembly', upper: 'Legislative Council' };
const HOUSE_OF_ASSEMBLY: House = { lower: 'House of Assembly', upper: 'Legislative Council' };

const CHAMBER_NAMES: Record<Jurisdiction, House> = {
  federal: { lower: 'House of Representatives', upper: 'Senate' },
  nsw: BICAMERAL_STATE,
  vic: BICAMERAL_STATE,
  wa: BICAMERAL_STATE,
  sa: HOUSE_OF_ASSEMBLY,
  tas: HOUSE_OF_ASSEMBLY,
  qld: BICAMERAL_STATE,
  act: BICAMERAL_STATE,
  nt: BICAMERAL_STATE,
};

export function chamberName(jurisdiction: Jurisdiction, chamber: Chamber): string {
  return CHAMBER_NAMES[jurisdiction][chamber];
}

function day(date: string): string {
  return formatPolicyDate({ type: 'published', date, precision: 'day' });
}

function describe(event: LegislativeEvent, jurisdiction: Jurisdiction): { label: string; detail?: string } {
  const house = (chamber: Chamber) => `the ${chamberName(jurisdiction, chamber)}`;
  switch (event.kind) {
    case 'introduced':
      return { label: `Introduced in ${house(event.chamber)}` };
    case 'referred':
      return {
        label: `Referred to the ${event.committee}`,
        detail: event.reportDue ? `Report due ${day(event.reportDue)}` : undefined,
      };
    case 'reported':
      return { label: `${event.committee} reported` };
    case 'passed':
      return {
        label: `Passed ${house(event.chamber)}`,
        detail: event.withAmendments ? 'With amendments' : undefined,
      };
    case 'assented':
      return { label: 'Assented', detail: event.actCitation };
    case 'lapsed':
      return { label: 'Lapsed' };
    case 'withdrawn':
      return { label: 'Withdrawn' };
    case 'negatived':
      return { label: `Negatived in ${house(event.chamber)}` };
    case 'registered':
      return { label: 'Registered on the Federal Register of Legislation' };
    case 'tabled':
      return {
        label: `Tabled in ${house(event.chamber)}`,
        detail: event.disallowanceEnds ? `Disallowance window ends ${day(event.disallowanceEnds)}` : undefined,
      };
    case 'disallowed':
      return { label: `Disallowed by ${house(event.chamber)}` };
    case 'commenced':
      return { label: event.extent === 'full' ? 'Commenced' : 'Partly commenced', detail: event.note };
    case 'amended':
      return { label: 'Amended', detail: `By ${event.by}` };
    case 'repealed':
      return { label: 'Repealed', detail: `By ${event.by}` };
  }
}

function upcoming(
  legislative: Legislative,
  jurisdiction: Jurisdiction,
  scheduledCommencement: string | undefined,
): ProgressStep[] {
  const status = legislativeStatus(legislative, jurisdiction);
  const kinds = new Set(legislative.events.map((dated) => dated.event.kind));
  const commencement: ProgressStep = { state: 'next', label: 'Commencement', date: scheduledCommencement };
  if (status === 'proposed') {
    const passed = new Set(
      legislative.events.flatMap((dated) => (dated.event.kind === 'passed' ? [dated.event.chamber] : [])),
    );
    const introduced = legislative.events.find((dated) => dated.event.kind === 'introduced')?.event;
    const origin = introduced?.kind === 'introduced' ? introduced.chamber : 'lower';
    const chambers = chambersOf(jurisdiction);
    const order = [...chambers.filter((c) => c === origin), ...chambers.filter((c) => c !== origin)];
    return [
      ...order
        .filter((chamber) => !passed.has(chamber))
        .map((chamber): ProgressStep => ({ state: 'next', label: `Passes the ${chamberName(jurisdiction, chamber)}` })),
      { state: 'next', label: 'Assent' },
      commencement,
    ];
  }
  if (status === 'active' && !kinds.has('commenced')) return [commencement];
  return [];
}

/**
 * What a reader sees of a legislative record's progress: every recorded
 * event in order, then the stages still ahead of a live bill or an Act
 * not yet in force. A scheduled commencement comes from the record's
 * `commenced` date when no commencement event exists yet.
 */
export function progressSteps(
  policy: Pick<Policy, 'jurisdiction' | 'dates'> & { legislative: Legislative },
): ProgressStep[] {
  const { legislative, jurisdiction } = policy;
  const done = legislative.events.map((dated): ProgressStep => ({
    state: 'done',
    ...describe(dated.event, jurisdiction),
    date: dated.date,
    precision: dated.precision,
    sourceUrl: dated.source.url,
  }));
  const scheduled = policy.dates.find((date) => date.type === 'commenced');
  const scheduledDate = scheduled ? String(scheduled.date).slice(0, 10) : undefined;
  return [...done, ...upcoming(legislative, jurisdiction, scheduledDate)];
}
