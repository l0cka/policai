import { describe, expect, it } from 'vitest';
import type { Jurisdiction, PolicyStatus, PolicyType } from '@/types';
import type { ThemeId } from '@/lib/themes';
import {
  COVERAGE_JURISDICTIONS,
  COVERAGE_MIN_RECORDS,
  buildCoverageData,
  coverageEmptySentence,
  coverageFootnote,
  coverageLevel,
  coverageStandfirst,
  parseCoverageViewState,
  serializeCoverageViewState,
  type CoverageCategory,
  type CoverageSource,
} from './coverage-data';

const VOCABULARY: CoverageCategory[] = [
  { key: 'courts-tribunals', label: 'Courts and tribunals' },
  { key: 'generative-ai', label: 'Generative AI' },
  { key: 'self-represented-litigants', label: 'Self-represented litigants' },
  { key: 'privacy-data', label: 'Privacy and data' },
  { key: 'frontier-ai', label: 'Frontier AI' },
];

let sequence = 0;
function source(
  jurisdiction: Jurisdiction,
  themes: ThemeId[],
  overrides: { type?: PolicyType; status?: PolicyStatus; title?: string; id?: string } = {},
): CoverageSource {
  sequence += 1;
  return {
    id: overrides.id ?? `record-${sequence}`,
    title: overrides.title ?? `Record ${sequence}`,
    jurisdiction,
    type: overrides.type ?? 'guideline',
    status: overrides.status ?? 'active',
    themes,
  };
}

const REGISTER = [
  source('nsw', ['courts-tribunals', 'generative-ai'], { id: 'nsw-sc-gen-23', title: 'SC Gen 23 — Use of AI in proceedings', type: 'practice_note' }),
  source('nsw', ['courts-tribunals'], { type: 'practice_note' }),
  source('vic', ['courts-tribunals', 'self-represented-litigants'], { type: 'practice_note' }),
  source('federal', ['generative-ai', 'privacy-data'], { type: 'policy' }),
  source('federal', ['generative-ai'], { type: 'policy', status: 'superseded' }),
  source('qld', ['generative-ai', 'generative-ai'], { type: 'guideline' }),
  source('tas', ['privacy-data'], { type: 'framework' }),
  source('nt', ['courts-tribunals'], { type: 'guideline', status: 'trashed' }),
];

describe('buildCoverageData', () => {
  const data = buildCoverageData(REGISTER, VOCABULARY);

  it('puts the jurisdictions in the specified column order', () => {
    expect(COVERAGE_JURISDICTIONS).toEqual(['federal', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt']);
  });

  it('counts each record once per theme and jurisdiction, with record ids in each cell', () => {
    const courts = data.theme.rows.find((row) => row.key === 'courts-tribunals');
    expect(courts?.cells.map((cell) => cell.length)).toEqual([0, 2, 1, 0, 0, 0, 0, 0, 0]);
    expect(courts?.cells[1]).toContain('nsw-sc-gen-23');
    const generative = data.theme.rows.find((row) => row.key === 'generative-ai');
    expect(generative?.cells.map((cell) => cell.length)).toEqual([2, 1, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('makes every total equal the sum of its row', () => {
    for (const row of [...data.theme.rows, ...data.type.rows]) {
      expect(row.cells.reduce((sum, cell) => sum + cell.length, 0)).toBe(row.total);
    }
  });

  it('excludes trashed records from every count', () => {
    expect(data.recordCount).toBe(7);
    expect(data.records['record-8']).toBeUndefined();
    expect(data.jurisdictionTotals[COVERAGE_JURISDICTIONS.indexOf('nt')]).toBe(0);
  });

  it('orders rows by total, then label, and labels them from the vocabulary', () => {
    expect(data.theme.rows.map((row) => [row.label, row.total])).toEqual([
      ['Generative AI', 4],
      ['Courts and tribunals', 3],
      ['Privacy and data', 2],
      ['Self-represented litigants', 1],
    ]);
    expect(data.theme.uncharted).toEqual([{ key: 'frontier-ai', label: 'Frontier AI', total: 0 }]);
    expect(data.theme.categoryCount).toBe(VOCABULARY.length);
  });

  it('builds the instrument-type axis on the same code path', () => {
    expect(data.type.rows.map((row) => [row.key, row.label, row.total])).toEqual([
      ['practice_note', 'Practice Note', 3],
      ['policy', 'Policy', 2],
      ['framework', 'Framework', 1],
      ['guideline', 'Guideline', 1],
    ]);
  });

  it('splits a title at its dash into a linked lead and the rest', () => {
    expect(data.records['nsw-sc-gen-23']).toMatchObject({ lead: 'SC Gen 23', rest: 'Use of AI in proceedings' });
    expect(data.records['record-2']).toMatchObject({ lead: 'Record 2', rest: null });
  });

  it('returns an empty chart for an empty register', () => {
    const empty = buildCoverageData([], VOCABULARY);
    expect(empty.recordCount).toBe(0);
    expect(empty.theme.rows).toEqual([]);
    expect(empty.theme.uncharted).toHaveLength(VOCABULARY.length);
    expect(coverageStandfirst(empty)).toEqual([]);
    expect(coverageEmptySentence(empty.theme)).toMatch(/^No theme has/);
  });
});

describe('coverageLevel', () => {
  it('maps counts to the four legend levels', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 30].map(coverageLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('page copy', () => {
  const data = buildCoverageData(REGISTER, VOCABULARY);

  it('states the largest theme and the jurisdictions with one or no record', () => {
    expect(coverageStandfirst(data)).toEqual([
      'Generative AI is the largest theme: 4 of 7 records, across three jurisdictions.',
      'Victoria, Queensland and Tasmania each have one record.',
      'South Australia, Western Australia, the ACT and the Northern Territory have no record yet.',
    ]);
  });

  it('names ties for the largest theme instead of picking one', () => {
    const tied = buildCoverageData(
      [source('nsw', ['courts-tribunals']), source('act', ['generative-ai'])],
      VOCABULARY,
    );
    expect(coverageStandfirst(tied)[0]).toBe('Courts and tribunals and Generative AI are the largest themes, with 1 of 2 records each.');
    expect(coverageStandfirst(tied)[1]).toBe('New South Wales and the ACT each have one record.');
  });

  it('says all when every theme in the vocabulary is charted', () => {
    const full = buildCoverageData(REGISTER, VOCABULARY.filter((theme) => theme.key !== 'frontier-ai'));
    expect(coverageFootnote(full.theme)).toMatch(/^All 4 themes in Policai's vocabulary have a verified record and are shown\. Themes are/);
  });

  it('describes the vocabulary and the uncharted themes in the footnote', () => {
    expect(COVERAGE_MIN_RECORDS).toBe(1);
    expect(coverageFootnote(data.theme)).toBe(
      "Four of the 5 themes in Policai's vocabulary have a verified record and are shown. One has no verified record yet. Themes are an editorial vocabulary assigned to verified register records, not legal categories, and a count does not measure how strong an instrument is.",
    );
    expect(coverageFootnote({ ...data.theme, minRecords: 3, rows: data.theme.rows.slice(0, 2), uncharted: [...data.theme.rows.slice(2), ...data.theme.uncharted] })).toBe(
      "Two of the 5 themes in Policai's vocabulary have three or more verified records and are shown. Two have fewer and are not charted and one has no verified record yet. Themes are an editorial vocabulary assigned to verified register records, not legal categories, and a count does not measure how strong an instrument is.",
    );
  });
});

describe('coverage view state', () => {
  const data = buildCoverageData(REGISTER, VOCABULARY);
  const parse = (query: string) => parseCoverageViewState(new URLSearchParams(query), data);

  it('restores a cell, a row and a column selection', () => {
    expect(parse('theme=courts-tribunals&j=nsw')).toEqual({ axis: 'theme', selection: { kind: 'cell', row: 'courts-tribunals', column: 'nsw' } });
    expect(parse('theme=courts-tribunals')).toEqual({ axis: 'theme', selection: { kind: 'row', row: 'courts-tribunals' } });
    expect(parse('j=vic')).toEqual({ axis: 'theme', selection: { kind: 'column', column: 'vic' } });
    expect(parse('by=type&type=policy&j=federal')).toEqual({ axis: 'type', selection: { kind: 'cell', row: 'policy', column: 'federal' } });
  });

  it('ignores unknown, empty and uncharted values', () => {
    expect(parse('theme=courts-tribunals&j=atlantis')).toEqual({ axis: 'theme', selection: { kind: 'row', row: 'courts-tribunals' } });
    expect(parse('theme=frontier-ai&j=')).toEqual({ axis: 'theme', selection: { kind: 'none' } });
    expect(parse('focus=x&by=graph')).toEqual({ axis: 'theme', selection: { kind: 'none' } });
    expect(parse('by=type&theme=courts-tribunals')).toEqual({ axis: 'type', selection: { kind: 'none' } });
  });

  it('round-trips through the URL', () => {
    for (const query of ['theme=courts-tribunals&j=nsw', 'j=vic', 'type=policy&by=type', '']) {
      expect(serializeCoverageViewState(parse(query)).toString()).toBe(query);
    }
  });
});
