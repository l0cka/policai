import {
  POLICY_TYPES,
  getPolicyTypeName,
  type Jurisdiction,
  type Policy,
  type PolicyStatus,
  type PolicyType,
} from '@/types';

export const COVERAGE_MIN_RECORDS = 1;

export const COVERAGE_JURISDICTIONS = [
  'federal',
  'nsw',
  'vic',
  'qld',
  'sa',
  'wa',
  'tas',
  'act',
  'nt',
] as const satisfies readonly Jurisdiction[];

export const COVERAGE_JURISDICTION_ABBREVIATIONS: Record<Jurisdiction, string> = {
  federal: 'Fed',
  nsw: 'NSW',
  vic: 'Vic',
  qld: 'Qld',
  sa: 'SA',
  wa: 'WA',
  tas: 'Tas',
  act: 'ACT',
  nt: 'NT',
};

const JURISDICTION_IN_SENTENCE: Record<Jurisdiction, string> = {
  federal: 'the Commonwealth',
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  sa: 'South Australia',
  wa: 'Western Australia',
  tas: 'Tasmania',
  act: 'the ACT',
  nt: 'the Northern Territory',
};

export type CoverageAxis = 'theme' | 'type';

export interface CoverageCategory {
  key: string;
  label: string;
}

export type CoverageSource = Pick<Policy, 'id' | 'title' | 'jurisdiction' | 'type' | 'status' | 'themes'>;

export interface CoverageRecord {
  id: string;
  lead: string;
  rest: string | null;
  jurisdiction: Jurisdiction;
  type: PolicyType;
  status: PolicyStatus;
}

export interface CoverageRow {
  key: string;
  label: string;
  total: number;
  cells: string[][];
}

export interface CoverageTotal {
  key: string;
  label: string;
  total: number;
}

export interface CoverageTable {
  axis: CoverageAxis;
  minRecords: number;
  categoryCount: number;
  rows: CoverageRow[];
  uncharted: CoverageTotal[];
}

export interface CoverageData {
  recordCount: number;
  jurisdictionTotals: number[];
  records: Record<string, CoverageRecord>;
  theme: CoverageTable;
  type: CoverageTable;
}

export type CoverageSelection =
  | { kind: 'none' }
  | { kind: 'cell'; row: string; column: Jurisdiction }
  | { kind: 'row'; row: string }
  | { kind: 'column'; column: Jurisdiction };

export interface CoverageViewState {
  axis: CoverageAxis;
  selection: CoverageSelection;
}

export type CoverageLevel = 0 | 1 | 2 | 3 | 4;

export const COVERAGE_LEVELS = [
  { level: 1, label: '1' },
  { level: 2, label: '2–3' },
  { level: 3, label: '4–6' },
  { level: 4, label: '7+' },
] as const;

const ROW_PARAM: Record<CoverageAxis, string> = { theme: 'theme', type: 'type' };
const COLUMN_PARAM = 'j';
const AXIS_PARAM = 'by';

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function countWord(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return value === 1 ? singular : pluralForm;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toLocaleUpperCase('en-AU') + value.slice(1);
}

export function coverageLevel(count: number): CoverageLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function splitTitle(title: string): { lead: string; rest: string | null } {
  const [lead, ...rest] = title.split(/\s+[—–]\s+/u);
  return rest.length > 0 && lead.trim().length > 0
    ? { lead: lead.trim(), rest: rest.join(' — ').trim() }
    : { lead: title, rest: null };
}

function buildTable(
  axis: CoverageAxis,
  sources: readonly CoverageSource[],
  categories: readonly CoverageCategory[],
  categoriesOf: (source: CoverageSource) => readonly string[],
  minRecords: number,
): CoverageTable {
  const columnIndex = new Map<Jurisdiction, number>(
    COVERAGE_JURISDICTIONS.map((jurisdiction, index) => [jurisdiction, index]),
  );
  const rows = new Map(
    categories.map((category) => [
      category.key,
      {
        key: category.key,
        label: category.label,
        total: 0,
        cells: COVERAGE_JURISDICTIONS.map((): string[] => []),
      },
    ]),
  );

  for (const source of sources) {
    const column = columnIndex.get(source.jurisdiction);
    if (column === undefined) continue;
    for (const key of new Set(categoriesOf(source))) {
      const row = rows.get(key);
      if (!row) continue;
      row.cells[column].push(source.id);
      row.total += 1;
    }
  }

  const ranked = [...rows.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'en-AU'),
  );

  return {
    axis,
    minRecords,
    categoryCount: categories.length,
    rows: ranked.filter((row) => row.total >= minRecords),
    uncharted: ranked
      .filter((row) => row.total < minRecords)
      .map(({ key, label, total }) => ({ key, label, total })),
  };
}

const POLICY_TYPE_CATEGORIES: CoverageCategory[] = POLICY_TYPES.map((type) => ({
  key: type,
  label: getPolicyTypeName(type),
}));

export function buildCoverageData(
  sources: readonly CoverageSource[],
  themes: readonly CoverageCategory[],
): CoverageData {
  const visible = sources.filter((source) => source.status !== 'trashed');
  const records: Record<string, CoverageRecord> = {};
  for (const source of visible) {
    records[source.id] = {
      id: source.id,
      ...splitTitle(source.title),
      jurisdiction: source.jurisdiction,
      type: source.type,
      status: source.status,
    };
  }

  return {
    recordCount: visible.length,
    jurisdictionTotals: COVERAGE_JURISDICTIONS.map(
      (jurisdiction) => visible.filter((source) => source.jurisdiction === jurisdiction).length,
    ),
    records,
    theme: buildTable('theme', visible, themes, (source) => source.themes, COVERAGE_MIN_RECORDS),
    type: buildTable('type', visible, POLICY_TYPE_CATEGORIES, (source) => [source.type], 1),
  };
}

export function coverageTable(data: CoverageData, axis: CoverageAxis): CoverageTable {
  return axis === 'theme' ? data.theme : data.type;
}

function isCoverageJurisdiction(value: string | null): value is Jurisdiction {
  return value !== null && (COVERAGE_JURISDICTIONS as readonly string[]).includes(value);
}

export function parseCoverageViewState(
  params: URLSearchParams,
  data: CoverageData,
): CoverageViewState {
  const axis: CoverageAxis = params.get(AXIS_PARAM) === 'type' ? 'type' : 'theme';
  const rowParam = params.get(ROW_PARAM[axis]);
  const row = coverageTable(data, axis).rows.some((candidate) => candidate.key === rowParam)
    ? rowParam
    : null;
  const columnParam = params.get(COLUMN_PARAM);
  const column = isCoverageJurisdiction(columnParam) ? columnParam : null;

  if (row && column) return { axis, selection: { kind: 'cell', row, column } };
  if (row) return { axis, selection: { kind: 'row', row } };
  if (column) return { axis, selection: { kind: 'column', column } };
  return { axis, selection: { kind: 'none' } };
}

export function serializeCoverageViewState(state: CoverageViewState): URLSearchParams {
  const params = new URLSearchParams();
  const { selection } = state;
  if (selection.kind === 'cell' || selection.kind === 'row') {
    params.set(ROW_PARAM[state.axis], selection.row);
  }
  if (selection.kind === 'cell' || selection.kind === 'column') {
    params.set(COLUMN_PARAM, selection.column);
  }
  if (state.axis === 'type') params.set(AXIS_PARAM, 'type');
  return params;
}

export function selectionKey(selection: CoverageSelection): string {
  switch (selection.kind) {
    case 'none':
      return 'none';
    case 'cell':
      return `cell:${selection.row}:${selection.column}`;
    case 'row':
      return `row:${selection.row}`;
    case 'column':
      return `column:${selection.column}`;
  }
}

export function coverageStandfirst(data: CoverageData): string[] {
  const facts: string[] = [];
  const charted = data.theme.rows;
  const top = charted[0];
  if (top && top.total > 0) {
    const tied = charted.filter((row) => row.total === top.total);
    const spread = top.cells.filter((cell) => cell.length > 0).length;
    facts.push(
      tied.length > 1
        ? `${joinList(tied.map((row) => row.label))} are the largest themes, with ${top.total} of ${data.recordCount} records each.`
        : `${top.label} is the largest theme: ${top.total} of ${data.recordCount} records, across ${countWord(spread)} ${plural(spread, 'jurisdiction')}.`,
    );
  }

  const byCount = (count: number) =>
    COVERAGE_JURISDICTIONS.filter((_, index) => data.jurisdictionTotals[index] === count).map(
      (jurisdiction) => JURISDICTION_IN_SENTENCE[jurisdiction],
    );
  const single = byCount(1);
  if (single.length === 1) facts.push(`${capitalise(single[0])} has one record.`);
  if (single.length > 1) facts.push(`${capitalise(joinList(single))} each have one record.`);
  const none = byCount(0);
  if (data.recordCount > 0 && none.length > 0) {
    facts.push(`${capitalise(joinList(none))} ${none.length === 1 ? 'has' : 'have'} no record yet.`);
  }
  return facts;
}

function agree(count: number): { has: string; is: string } {
  return count === 1 ? { has: 'has', is: 'is' } : { has: 'have', is: 'are' };
}

function themeScope(table: CoverageTable): string {
  const shown = table.rows.length;
  const unused = table.uncharted.filter((entry) => entry.total === 0).length;
  const below = table.uncharted.length - unused;
  const vocabulary = `${countWord(table.categoryCount)} themes in Policai's vocabulary`;
  const need =
    table.minRecords <= 1 ? 'a verified record' : `${countWord(table.minRecords)} or more verified records`;
  if (shown === table.categoryCount) return `All ${vocabulary} have ${need} and are shown.`;
  if (unused === table.categoryCount) return `None of the ${vocabulary} has a verified record yet.`;
  const clauses = [
    shown === 0
      ? `none has ${need}`
      : `${countWord(shown)} ${agree(shown).has} ${need} and ${agree(shown).is} shown`,
    below > 0 ? `${countWord(below)} ${agree(below).has} fewer and ${agree(below).is} not charted` : null,
    unused > 0 ? `${countWord(unused)} ${agree(unused).has} no verified record yet` : null,
  ].filter((clause): clause is string => clause !== null);
  return `Of the ${vocabulary}, ${clauses.join('; ')}.`;
}

export function coverageFootnote(table: CoverageTable): string {
  const shown = table.rows.length;
  if (table.axis === 'type') {
    return `${capitalise(countWord(shown))} instrument ${shown > 1 ? 'types have' : 'type has'} a verified record. The type is the register's own classification of each instrument, and a count does not measure how strong an instrument is.`;
  }
  return `${themeScope(table)} Themes are an editorial vocabulary assigned to verified register records, not legal categories, and a count does not measure how strong an instrument is.`;
}

export function coverageEmptySentence(table: CoverageTable): string {
  return table.minRecords <= 1
    ? 'No theme has a verified record yet.'
    : `No theme has ${countWord(table.minRecords)} or more verified records yet.`;
}
