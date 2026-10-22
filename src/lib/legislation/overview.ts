import { JURISDICTIONS, type DatePrecision, type Policy } from '@/types';
import { chambersOf, legislativePhase, type Legislative } from './model';
import { describeEvent } from './progress';

export type LegislativeRecord = Policy & { legislative: Legislative };

export type LegislativeStage = 'before_parliament' | 'made' | 'in_force' | 'ended';

export const LEGISLATIVE_STAGES: readonly LegislativeStage[] = ['before_parliament', 'made', 'in_force', 'ended'];

export const LEGISLATIVE_STAGE_NAMES: Record<LegislativeStage, string> = {
  before_parliament: 'Before Parliament',
  made: 'Made, not yet in force',
  in_force: 'In force',
  ended: 'Ended',
};

export function isLegislativeRecord(policy: Policy): policy is LegislativeRecord {
  return policy.legislative !== undefined;
}

/** A repealed law and a lapsed bill both read as ended. */
export function legislativeStage(record: LegislativeRecord): LegislativeStage | null {
  const phase = legislativePhase(record.legislative, record.jurisdiction);
  return phase === 'repealed' ? 'ended' : phase;
}

export interface DatedEntry {
  record: LegislativeRecord;
  date: string;
  precision: DatePrecision;
  label: string;
  detail?: string;
  sourceUrl: string;
}

export interface BillInParliament {
  record: LegislativeRecord;
  chambersPassed: number;
  chambers: number;
  last: DatedEntry;
}

function entries(record: LegislativeRecord): DatedEntry[] {
  return record.legislative.events.map((dated) => ({
    record,
    date: dated.date,
    precision: dated.precision,
    ...describeEvent(dated.event, record.jurisdiction),
    sourceUrl: dated.source.url,
  }));
}

const jurisdictionOrder = (record: LegislativeRecord) => JURISDICTIONS.indexOf(record.jurisdiction);

/** Live bills, Commonwealth first, then each state in register order, latest movement first. */
export function beforeParliament(records: LegislativeRecord[]): BillInParliament[] {
  return records
    .filter((record) => legislativeStage(record) === 'before_parliament')
    .map((record) => ({
      record,
      chambersPassed: new Set(
        record.legislative.events.flatMap((dated) => (dated.event.kind === 'passed' ? [dated.event.chamber] : [])),
      ).size,
      chambers: chambersOf(record.jurisdiction).length,
      last: entries(record).at(-1)!,
    }))
    .sort(
      (a, b) =>
        jurisdictionOrder(a.record) - jurisdictionOrder(b.record) || b.last.date.localeCompare(a.last.date),
    );
}

function upcomingDates(record: LegislativeRecord): DatedEntry[] {
  const stage = legislativeStage(record);
  if (stage === null || stage === 'ended') return [];
  const found: DatedEntry[] = [];
  const disallowanceEnds = new Set<string>();
  for (const dated of record.legislative.events) {
    const { event } = dated;
    if (event.kind === 'referred' && event.reportDue && stage === 'before_parliament') {
      found.push({ record, date: event.reportDue, precision: 'day', label: 'Committee report due', detail: event.committee, sourceUrl: event.inquiryUrl });
    }
    if (event.kind === 'tabled' && event.disallowanceEnds && !disallowanceEnds.has(event.disallowanceEnds)) {
      disallowanceEnds.add(event.disallowanceEnds);
      found.push({ record, date: event.disallowanceEnds, precision: 'day', label: 'Disallowance window ends', sourceUrl: dated.source.url });
    }
  }
  const commenced = record.legislative.events.some((dated) => dated.event.kind === 'commenced');
  const scheduled = record.dates.find((date) => date.type === 'commenced');
  if (!commenced && scheduled) {
    found.push({
      record,
      date: String(scheduled.date).slice(0, 10),
      precision: scheduled.precision,
      label: 'Scheduled commencement',
      sourceUrl: scheduled.source?.url ?? record.sourceUrl,
    });
  }
  return found;
}

/** Report dates, disallowance window ends and commencements from `today` (YYYY-MM-DD), soonest first. */
export function comingUp(records: LegislativeRecord[], today: string): DatedEntry[] {
  return records
    .flatMap(upcomingDates)
    .filter((entry) => entry.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.record.title.localeCompare(b.record.title));
}

const MADE = new Set(['assented', 'registered', 'commenced']);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Assents, registrations and commencements in the `days` up to `today`, latest first. */
export function recentlyMade(records: LegislativeRecord[], today: string, days = 90): DatedEntry[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
  return records
    .flatMap((record) =>
      entries(record).filter((_, index) => MADE.has(record.legislative.events[index].event.kind)),
    )
    .filter((entry) => entry.date >= since && entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || a.record.title.localeCompare(b.record.title));
}
