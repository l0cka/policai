import { describe, expect, it } from 'vitest';
import { DATE_PRECISIONS, POLICY_TYPES, type DatePrecision, type Policy, type PolicyType } from '@/types';
import { citeRecord } from './cite';

type Citable = Parameters<typeof citeRecord>[0];

function record(overrides: Partial<Citable> = {}): Citable {
  return {
    id: 'sample-record',
    title: 'Sample Instrument',
    jurisdiction: 'federal',
    type: 'guideline',
    effectiveDate: '2024-05-01',
    dates: [{ type: 'published', date: '2024-05-01', precision: 'day', primary: true }],
    agencies: ['Digital Transformation Agency'],
    sourceUrl: 'https://www.digital.gov.au/sample',
    lastReviewedAt: '2026-11-07T04:26:43.526Z',
    ...overrides,
  };
}

function dated(precision: DatePrecision): Policy['dates'] {
  return [{ type: 'published', date: '2024-05-01', precision, primary: true }];
}

const DATE_TEXT: Record<DatePrecision, string> = {
  day: '1 May 2024',
  month: 'May 2024',
  year: '2024',
};

const DOCUMENT_LABEL: Record<PolicyType, string> = {
  legislation: 'Legislation',
  regulation: 'Regulation',
  guideline: 'Guideline',
  framework: 'Framework',
  standard: 'Standard',
  practice_note: 'Practice Note',
  policy: 'Policy',
  tool: 'Tool',
  funding_program: 'Funding Program',
};

describe('citeRecord', () => {
  describe.each(POLICY_TYPES)('%s without a short title', (type) => {
    it.each(DATE_PRECISIONS)('prints a %s-precision date and nothing finer', (precision) => {
      expect(citeRecord(record({ type, dates: dated(precision) })).citation).toBe(
        `Digital Transformation Agency, Sample Instrument (${DOCUMENT_LABEL[type]}, ${DATE_TEXT[precision]}) <https://www.digital.gov.au/sample>`,
      );
    });
  });

  it.each([
    ['legislation', 'Privacy and Other Legislation Amendment Act 2024', 'federal', 'Privacy and Other Legislation Amendment Act 2024 (Cth)'],
    ['legislation', 'Online Safety Amendment (Digital Duty of Care) Bill 2026', 'federal', 'Online Safety Amendment (Digital Duty of Care) Bill 2026 (Cth)'],
    ['legislation', 'Electoral Legislation Amendment (Elections) Act 2026', 'nsw', 'Electoral Legislation Amendment (Elections) Act 2026 (NSW)'],
    ['regulation', 'Online Safety (Basic Online Safety Expectations) Determination 2022', 'federal', 'Online Safety (Basic Online Safety Expectations) Determination 2022 (Cth)'],
  ] as const)('cites %s "%s" by short title and jurisdiction', (type, title, jurisdiction, expected) => {
    expect(
      citeRecord(
        record({
          type,
          title,
          jurisdiction,
          dates: [{ type: 'commenced', date: '2027-01-01', precision: 'day', primary: true }],
        }),
      ).citation,
    ).toBe(expected);
  });

  it.each([
    ['federal', 'Cth'],
    ['nsw', 'NSW'],
    ['vic', 'Vic'],
    ['qld', 'Qld'],
    ['wa', 'WA'],
    ['sa', 'SA'],
    ['tas', 'Tas'],
    ['act', 'ACT'],
    ['nt', 'NT'],
  ] as const)('abbreviates %s as %s', (jurisdiction, abbreviation) => {
    expect(citeRecord(record({ type: 'legislation', title: 'Sample Act 2024', jurisdiction })).citation).toBe(
      `Sample Act 2024 (${abbreviation})`,
    );
  });

  it('falls back to the document form when a legislation title is a description, not a short title', () => {
    expect(
      citeRecord(
        record({
          type: 'legislation',
          jurisdiction: 'sa',
          title: 'Electoral (Miscellaneous) Amendment Act 2024 — AI-generated electoral advertisements',
          agencies: ['Parliament of South Australia'],
        }),
      ).citation,
    ).toBe(
      'Parliament of South Australia, Electoral (Miscellaneous) Amendment Act 2024 — AI-generated electoral advertisements (Legislation, 1 May 2024) <https://www.digital.gov.au/sample>',
    );
  });

  it('never gives a short-title form to a non-legislative type whose title ends in a year', () => {
    expect(citeRecord(record({ type: 'policy', title: 'AI Strategy 2026' })).citation).toBe(
      'Digital Transformation Agency, AI Strategy 2026 (Policy, 1 May 2024) <https://www.digital.gov.au/sample>',
    );
  });

  it.each([
    [[], 'Sample Instrument (Guideline, 1 May 2024) <https://www.digital.gov.au/sample>'],
    [['A', 'B'], 'A and B, Sample Instrument (Guideline, 1 May 2024) <https://www.digital.gov.au/sample>'],
    [['A', 'B', 'C'], 'A, B and C, Sample Instrument (Guideline, 1 May 2024) <https://www.digital.gov.au/sample>'],
    [['A', 'B', 'C', 'D'], 'A et al, Sample Instrument (Guideline, 1 May 2024) <https://www.digital.gov.au/sample>'],
  ])('names the authors %j', (agencies, expected) => {
    expect(citeRecord(record({ agencies })).citation).toBe(expected);
  });

  it('leaves the source out when the record has none', () => {
    expect(citeRecord(record({ sourceUrl: '' })).citation).toBe(
      'Digital Transformation Agency, Sample Instrument (Guideline, 1 May 2024)',
    );
  });

  it('gives the Policai permalink with the Sydney date the record was last verified', () => {
    expect(citeRecord(record({ lastReviewedAt: '2026-11-06T20:30:00.000Z' })).permalink).toBe(
      'Sample Instrument <https://policai.org/policies/sample-record> (as recorded by Policai, verified 7 November 2026)',
    );
  });

  it('claims no verification date for a record that has none', () => {
    expect(citeRecord(record({ lastReviewedAt: undefined })).permalink).toBe(
      'Sample Instrument <https://policai.org/policies/sample-record> (as recorded by Policai)',
    );
  });
});
