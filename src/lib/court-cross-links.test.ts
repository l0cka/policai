import { describe, expect, it } from 'vitest';
import type { Jurisdiction, Policy, PublishedArticle } from '@/types';
import type { ThemeId } from '@/lib/themes';
import {
  analysesByCourtPolicy,
  courtFocusedAnalyses,
  courtLaneRelated,
} from './court-cross-links';

function policy(
  id: string,
  themes: ThemeId[],
  overrides: Partial<Policy> & { jurisdiction?: Jurisdiction; type?: Policy['type'] } = {},
): Policy {
  const date = '2026-01-01';
  return {
    id,
    title: `Title ${id}`,
    description: '',
    jurisdiction: 'federal',
    type: 'practice_note',
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

function article(
  slug: string,
  cites: string[],
  publishedAt = '2026-10-01',
): PublishedArticle {
  return {
    slug,
    type: 'explainer',
    title: `Article ${slug}`,
    summary: `Summary ${slug}`,
    status: 'published',
    publishedAt,
    cites,
    sources: ['https://example.gov.au'],
    corrections: [],
    body: '',
    blocks: [],
  };
}

const themes: ThemeId[] = ['generative-ai', 'courts-tribunals', 'ai-governance'];

describe('courtFocusedAnalyses', () => {
  it('keeps only pieces that cite a court id and ranks by court-cite density', () => {
    const courtIds = new Set(['a', 'b', 'c']);
    const result = courtFocusedAnalyses(
      [
        article('sparse', ['a'], '2026-10-10'),
        article('dense', ['a', 'b', 'c'], '2026-10-01'),
        article('other', ['oaic'], '2026-10-11'),
      ],
      courtIds,
    );
    expect(result.map((item) => item.slug)).toEqual(['dense', 'sparse']);
    expect(result[0].courtCiteCount).toBe(3);
  });
});

describe('analysesByCourtPolicy', () => {
  it('indexes each court id with the pieces that cite it', () => {
    const courtIds = new Set(['a', 'b']);
    const byId = analysesByCourtPolicy(
      [article('one', ['a', 'b']), article('two', ['a'])],
      courtIds,
    );
    expect(byId.a.map((item) => item.slug)).toEqual(['one', 'two']);
    expect(byId.b.map((item) => item.slug)).toEqual(['one']);
  });
});

describe('courtLaneRelated', () => {
  it('prefers practice notes and caps the accordion list', () => {
    const self = policy('self', themes);
    const peerNote = policy('peer-note', themes);
    const peerGuide = policy('peer-guide', themes, { type: 'guideline' });
    const result = courtLaneRelated(self, [self, peerNote, peerGuide], 1);
    expect(result.map((item) => item.id)).toEqual(['peer-note']);
  });
});
