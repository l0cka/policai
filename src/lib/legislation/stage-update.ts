import type { Jurisdiction, PolicyStatus } from '@/types';
import { legislativeStatus, type Chamber, type Dated, type Legislative, type LegislativeEvent } from './model';

/** What a follow watch read from an official register page for one record. */
export interface RegisterReading<E extends LegislativeEvent = LegislativeEvent> {
  title: string | null;
  events: Dated<E>[];
  /** Stages with no lifecycle meaning yet, for a reviewer to read. */
  unrecognised: UnrecognisedStage[];
}

export interface UnrecognisedStage {
  chamber: Chamber | null;
  stage: string;
  date: string;
}

const RANK: Record<LegislativeEvent['kind'], number> = {
  introduced: 0,
  registered: 0,
  referred: 1,
  tabled: 1,
  reported: 2,
  passed: 3,
  negatived: 3,
  disallowed: 3,
  lapsed: 4,
  withdrawn: 4,
  assented: 5,
  commenced: 6,
  amended: 7,
  repealed: 8,
};

function sameEvent(a: Dated<LegislativeEvent>, b: Dated<LegislativeEvent>): boolean {
  if (a.date !== b.date || a.event.kind !== b.event.kind) return false;
  const chamber = (event: LegislativeEvent) => ('chamber' in event ? event.chamber : undefined);
  const committee = (event: LegislativeEvent) => ('committee' in event ? event.committee : undefined);
  return chamber(a.event) === chamber(b.event) && committee(a.event) === committee(b.event);
}

/** The deadline an event carries: a committee's report date or the end of a disallowance window. */
function deadline(event: LegislativeEvent): string | undefined {
  if (event.kind === 'referred') return event.reportDue;
  if (event.kind === 'tabled') return event.disallowanceEnds;
  return undefined;
}

export type StageUpdate =
  | { kind: 'unchanged' }
  | { kind: 'update'; added: Dated<LegislativeEvent>[]; changed: Dated<LegislativeEvent>[]; legislative: Legislative; status: PolicyStatus }
  | { kind: 'invalid'; added: Dated<LegislativeEvent>[]; changed: Dated<LegislativeEvent>[]; error: string };

/**
 * The record's events plus any stage the register shows that the record
 * lacks, and any deadline the register has set or moved since. Events the
 * register does not show stay. A merged history that breaks the legal order
 * is reported, not applied, so a reviewer reads the page.
 */
export function stageUpdate(legislative: Legislative, jurisdiction: Jurisdiction, reading: RegisterReading): StageUpdate {
  const known: readonly Dated<LegislativeEvent>[] = legislative.events;
  const added = reading.events.filter((parsed) => !known.some((entry) => sameEvent(entry, parsed)));
  const changed = reading.events.filter((parsed) =>
    known.some((entry) => sameEvent(entry, parsed) && deadline(parsed.event) !== undefined && deadline(parsed.event) !== deadline(entry.event)),
  );
  if (added.length === 0 && changed.length === 0) return { kind: 'unchanged' };
  const events = [...known.map((entry) => changed.find((parsed) => sameEvent(entry, parsed)) ?? entry), ...added].sort(
    (a, b) => a.date.localeCompare(b.date) || RANK[a.event.kind] - RANK[b.event.kind],
  );
  const merged = { ...legislative, events } as Legislative;
  const status = legislativeStatus(merged, jurisdiction);
  return status
    ? { kind: 'update', added, changed, legislative: merged, status }
    : { kind: 'invalid', added, changed, error: 'the register and the record together break the legal order of stages' };
}
