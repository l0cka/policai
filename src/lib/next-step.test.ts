import { describe, expect, it } from 'vitest';
import { followsForCitedRecords, followsForRecord, moreAnalysis } from './next-step';

describe('followsForRecord', () => {
  it('offers the record, its jurisdiction and its first two themes', () => {
    const follows = followsForRecord({
      id: 'vic-policy',
      title: 'A policy',
      jurisdiction: 'vic',
      themes: ['generative-ai', 'public-sector', 'privacy-data'],
    });
    expect(follows).toEqual([
      { follow: { kind: 'policy', id: 'vic-policy' }, label: 'this record' },
      { follow: { kind: 'jurisdiction', id: 'vic' }, label: 'Victoria' },
      { follow: { kind: 'theme', id: 'generative-ai' }, label: 'Generative AI' },
      { follow: { kind: 'theme', id: 'public-sector' }, label: 'Public sector use' },
    ]);
  });
});

describe('followsForCitedRecords', () => {
  it('offers nothing when the piece cites no public record', () => {
    expect(followsForCitedRecords([])).toEqual([]);
  });

  it('offers the most cited jurisdiction and themes, ties in citation order', () => {
    const follows = followsForCitedRecords([
      { id: 'a', title: 'A', jurisdiction: 'nsw', themes: ['privacy-data', 'courts-tribunals'] },
      { id: 'b', title: 'B', jurisdiction: 'federal', themes: ['generative-ai', 'courts-tribunals'] },
      { id: 'c', title: 'C', jurisdiction: 'federal', themes: ['legal-practice'] },
    ]);
    expect(follows.map(({ follow }) => `${follow.kind}:${follow.id}`)).toEqual([
      'jurisdiction:federal',
      'theme:courts-tribunals',
      'theme:privacy-data',
    ]);
  });
});

describe('moreAnalysis', () => {
  const current = { slug: 'current', cites: ['x', 'y'], publishedAt: '2026-10-10' };

  it('ranks shared citations first, then the newest, and leaves out the current piece', () => {
    const result = moreAnalysis(current, [
      current,
      { slug: 'newest', cites: [], publishedAt: '2026-10-30' },
      { slug: 'shares-one', cites: ['x'], publishedAt: '2026-09-01' },
      { slug: 'shares-two', cites: ['y', 'x'], publishedAt: '2026-08-01' },
      { slug: 'older', cites: ['z'], publishedAt: '2026-10-01' },
    ]);
    expect(result.map(({ slug, sharedCites }) => [slug, sharedCites])).toEqual([
      ['shares-two', 2],
      ['shares-one', 1],
      ['newest', 0],
    ]);
  });
});
