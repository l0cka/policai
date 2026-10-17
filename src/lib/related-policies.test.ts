import { describe, expect, it } from 'vitest';
import type { Jurisdiction, Policy } from '@/types';
import type { ThemeId } from '@/lib/themes';
import { RELATED_VISIBLE_LIMIT, relatedInstruments } from './related-policies';

function policy(
  id: string,
  themes: ThemeId[],
  overrides: Partial<Policy> & { date?: string; jurisdiction?: Jurisdiction } = {},
): Policy {
  const date = overrides.date ?? '2026-01-01';
  return {
    id,
    title: `Title ${id}`,
    description: '',
    jurisdiction: 'federal',
    type: 'guideline',
    status: 'active',
    effectiveDate: date,
    dates: [{ type: 'issued', date, precision: 'day', primary: true }],
    agencies: [],
    tags: [],
    themes,
    sourceUrl: 'https://example.gov.au',
    content: '',
    aiSummary: '',
    createdAt: date,
    updatedAt: date,
    verification: { status: 'verified', source: { url: 'https://example.gov.au' } },
    ...overrides,
  };
}

const T: ThemeId[] = ['generative-ai', 'courts-tribunals', 'ai-governance', 'privacy-data'];

describe('relatedInstruments', () => {
  it('ranks neighbours by shared theme count, descending', () => {
    const self = policy('self', [T[0], T[1], T[2]]);
    const two = policy('two', [T[0], T[1]]);
    const three = policy('three', [T[0], T[1], T[2]]);
    const result = relatedInstruments(self, [self, two, three]);
    expect(result.map((item) => item.id)).toEqual(['three', 'two']);
    expect(result[0].sharedThemes).toEqual([
      'Generative AI',
      'Courts and tribunals',
      'AI governance',
    ]);
  });

  it('ranks a heavier cross-jurisdiction record first, then same-jurisdiction by newest primary date', () => {
    const self = policy('self', [T[0], T[1]]);
    const sameOld = policy('same-old', [T[0], T[1]], { date: '2024-01-01' });
    const sameNew = policy('same-new', [T[0], T[1]], { date: '2026-05-01' });
    const crossNewest = policy('cross', [T[0], T[1], T[2]], { jurisdiction: 'nsw', date: '2026-09-01' });
    const crossTie = policy('cross-tie', [T[0], T[1]], { jurisdiction: 'nsw' });
    const selfWide = { ...self, themes: [T[0], T[1], T[2]] };
    const result = relatedInstruments(selfWide, [selfWide, sameOld, sameNew, crossNewest, crossTie]);
    expect(result.map((item) => item.id)).toEqual(['cross', 'same-new', 'same-old']);
  });

  it('puts a same-jurisdiction record before a cross-jurisdiction one of equal weight, whatever their dates', () => {
    const self = policy('self', [T[0], T[1], T[2]]);
    const cross = policy('cross', [T[0], T[1], T[2]], { jurisdiction: 'nsw', date: '2026-09-01', title: 'Alpha cross' });
    const same = policy('same', [T[0], T[1], T[2]], { date: '2020-01-01', title: 'Zulu same' });
    expect(relatedInstruments(self, [self, cross, same]).map((item) => item.id)).toEqual(['same', 'cross']);
  });

  it('orders equal-weight neighbours of one jurisdiction by newest primary date, not by title', () => {
    const self = policy('self', [T[0], T[1]]);
    const older = policy('older', [T[0], T[1]], { date: '2024-01-01', title: 'Alpha' });
    const newer = policy('newer', [T[0], T[1]], { date: '2026-05-01', title: 'Zulu' });
    expect(relatedInstruments(self, [self, older, newer]).map((item) => item.id)).toEqual(['newer', 'older']);
  });

  it('orders full ties by title ascending in the Australian locale', () => {
    const self = policy('self', [T[0], T[1]]);
    const titled = (id: string, title: string) => policy(id, [T[0], T[1]], { title });
    const result = relatedInstruments(self, [
      self,
      titled('zeta', 'Zeta'),
      titled('banana', 'Banana'),
      titled('apple', 'apple'),
    ]);
    expect(result.map((item) => item.title)).toEqual(['apple', 'Banana', 'Zeta']);
  });

  it('lists shared themes in the viewed record\'s theme order whichever record was read first', () => {
    const self = policy('self', [T[2], T[0], T[1]]);
    const other = policy('other', [T[1], T[0], T[2], T[3]]);
    const expected = ['AI governance', 'Generative AI', 'Courts and tribunals'];
    expect(relatedInstruments(self, [self, other])[0].sharedThemes).toEqual(expected);
    expect(relatedInstruments(self, [other, self])[0].sharedThemes).toEqual(expected);
  });

  it('puts the superseding record first and does not repeat it as a neighbour', () => {
    const self = policy('old', [T[0], T[1]], { status: 'superseded', supersededBy: 'new' });
    const successor = policy('new', [T[0], T[1]]);
    const stronger = policy('stronger', [T[0], T[1], T[2]]);
    const selfWide = { ...self, themes: [T[0], T[1], T[2]] };
    const result = relatedInstruments(selfWide, [selfWide, stronger, successor]);
    expect(result.map((item) => item.id)).toEqual(['new', 'stronger']);
    expect(result[0].relation).toBe('Superseded by');
    expect(result[1].relation).toBeUndefined();
  });

  it('labels records that this one replaced as Supersedes', () => {
    const self = policy('new', [T[0]]);
    const predecessor = policy('old', [T[1]], { supersededBy: 'new' });
    const result = relatedInstruments(self, [self, predecessor]);
    expect(result).toEqual([
      expect.objectContaining({ id: 'old', relation: 'Supersedes', sharedThemes: [] }),
    ]);
  });

  it('excludes the record itself and records missing from the public list', () => {
    const self = policy('self', [T[0], T[1]], { supersededBy: 'hidden' });
    const result = relatedInstruments(self, [self, policy('visible', [T[0], T[1]])]);
    expect(result.map((item) => item.id)).toEqual(['visible']);
  });

  it('returns every connection so the caller can cap and count', () => {
    const self = policy('self', [T[0], T[1]]);
    const others = Array.from({ length: RELATED_VISIBLE_LIMIT + 4 }, (_, index) =>
      policy(`n${index}`, [T[0], T[1]]),
    );
    expect(relatedInstruments(self, [self, ...others])).toHaveLength(RELATED_VISIBLE_LIMIT + 4);
  });

  it('returns an empty list when nothing connects', () => {
    const self = policy('self', [T[0]]);
    expect(relatedInstruments(self, [self, policy('other', [T[3]])])).toEqual([]);
  });

  it('carries id, title, jurisdiction and type', () => {
    const self = policy('self', [T[0], T[1], T[2]]);
    const other = policy('other', [T[0], T[1], T[2]], { jurisdiction: 'vic', type: 'legislation' });
    expect(relatedInstruments(self, [self, other])[0]).toEqual({
      id: 'other',
      title: 'Title other',
      jurisdiction: 'vic',
      type: 'legislation',
      sharedThemes: ['Generative AI', 'Courts and tribunals', 'AI governance'],
    });
  });
});
