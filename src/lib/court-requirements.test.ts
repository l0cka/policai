import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { CourtRequirement, PublicCourtRequirement } from '@/types';
import {
  filterCourtRequirements,
  stageCourtRequirementCandidates,
} from './court-requirements';
import { validateCourtRequirements } from './validate-data';

const sourceHash = 'a'.repeat(64);
const sourceUrl = 'https://example.gov.au/court-guidance';

function pendingRequirement(
  overrides: Partial<CourtRequirement> = {},
): CourtRequirement {
  return {
    id: 'requirement-1',
    policyId: 'court-policy',
    actor: 'Judicial officers',
    modality: 'must_not',
    action: 'Use generative AI to formulate reasons.',
    conditions: [],
    exceptions: [],
    topics: ['reasons'],
    source: {
      url: sourceUrl,
      contentHash: sourceHash,
      locator: 'paragraph 4',
      quote: 'Judicial officers must not use generative AI to formulate reasons.',
    },
    extraction: {
      method: 'ai',
      extractedAt: '2026-08-26T00:00:00Z',
      extractedBy: 'test extractor',
    },
    verification: { status: 'pending_review' },
    ...overrides,
  };
}

describe('court requirements', () => {
  it('stages only proposals anchored to exact source text', () => {
    const input = {
      policyId: 'court-policy',
      sourceUrl,
      contentHash: sourceHash,
      sourceText:
        'Judicial officers must not use generative AI\n  to formulate reasons.',
      extractedAt: '2026-08-26T00:00:00Z',
      extractedBy: 'test extractor',
      method: 'ai' as const,
      proposals: [
        {
          id: 'requirement-1',
          actor: 'Judicial officers',
          modality: 'must_not' as const,
          action: 'Use generative AI to formulate reasons.',
          locator: 'paragraph 4',
          quote:
            'Judicial officers must not use generative AI to formulate reasons.',
        },
      ],
    };

    expect(stageCourtRequirementCandidates(input)[0]).toMatchObject({
      verification: { status: 'pending_review' },
      source: {
        quote:
          'Judicial officers must not use generative AI to formulate reasons.',
      },
    });
    expect(() =>
      stageCourtRequirementCandidates({
        ...input,
        proposals: [
          {
            ...input.proposals[0],
            quote: 'A sentence that is not in the source.',
          },
        ],
      }),
    ).toThrow('source quote was not found');
  });

  it('filters verified public requirements by legal dimensions', () => {
    const requirement = {
      ...pendingRequirement({ verification: { status: 'verified' } }),
      policy: buildPolicy({
        id: 'court-policy',
        title: 'Court guidance',
        jurisdiction: 'nsw',
        type: 'practice_note',
      }),
    } as PublicCourtRequirement;

    expect(
      filterCourtRequirements([requirement], {
        jurisdiction: 'nsw',
        actor: 'judicial',
        modality: 'must_not',
        topic: 'reasons',
      }),
    ).toEqual([requirement]);
    expect(filterCourtRequirements([requirement], { actor: 'party' })).toEqual(
      [],
    );
  });

  it('withholds pending records and validates source-bound review evidence', () => {
    const policy = buildPolicy({
      id: 'court-policy',
      type: 'practice_note',
      sourceUrl,
      verification: {
        status: 'verified',
        checkedAt: '2026-08-26T00:00:00Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: { url: sourceUrl, contentHash: sourceHash },
      },
    });

    const pending = validateCourtRequirements([pendingRequirement()], [policy]);
    expect(pending.errors).toEqual([]);
    expect(pending.warnings).toEqual([
      expect.stringContaining('await editorial review'),
    ]);

    const invalid = validateCourtRequirements(
      [
        pendingRequirement({
          source: {
            ...pendingRequirement().source,
            contentHash: 'b'.repeat(64),
          },
          verification: { status: 'verified' },
        }),
      ],
      [policy],
    );
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must match the verified policy source'),
        expect.stringContaining('needs a review timestamp'),
        expect.stringContaining('needs a reviewer identity'),
      ]),
    );
  });
});
