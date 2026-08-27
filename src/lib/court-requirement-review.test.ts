/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { CourtRequirement, Policy } from '@/types';

const { getPolicies, readJsonFile, writeJsonFile } = vi.hoisted(() => ({
  getPolicies: vi.fn(),
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile }));
vi.mock('@/lib/data-lock', () => ({
  withDataMutationLock: vi.fn((run: () => Promise<unknown>) => run()),
}));
vi.mock('@/lib/data-service', () => ({ getPolicies }));

import {
  getCourtRequirementsForReview,
  getPublicCourtRequirements,
  reviewCourtRequirement,
} from './court-requirements';

const sourceUrl = 'https://example.gov.au/court-guidance';
const sourceHash = 'a'.repeat(64);

function requirement(
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
      quote: 'Judicial officers must not use generative AI.',
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

function policy(contentHash = sourceHash): Policy {
  return buildPolicy({
    id: 'court-policy',
    type: 'practice_note',
    sourceUrl,
    verification: {
      status: 'verified',
      checkedAt: '2026-08-26T00:00:00Z',
      checkedBy: 'source reviewer',
      method: 'manual',
      source: { url: sourceUrl, contentHash },
    },
  });
}

function mockData(requirements: CourtRequirement[], policies = [policy()]) {
  readJsonFile.mockImplementation(async (filePath: string) =>
    filePath.endsWith('court-requirements.json') ? requirements : policies,
  );
}

describe('court requirement review workflow', () => {
  beforeEach(() => {
    readJsonFile.mockReset();
    writeJsonFile.mockReset();
    getPolicies.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies a pending candidate with human attribution', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T02:00:00Z'));
    mockData([requirement()]);

    const reviewed = await reviewCourtRequirement({
      id: 'requirement-1',
      decision: 'verified',
      reviewer: 'Jane Reviewer',
      notes: 'Compared the proposition with paragraph 4.',
      revision: {
        actor: 'Judicial officers in New South Wales courts',
      },
    });

    expect(reviewed.verification).toEqual({
      status: 'verified',
      reviewedAt: '2026-08-26T02:00:00.000Z',
      reviewedBy: 'Jane Reviewer',
      notes: 'Compared the proposition with paragraph 4.',
    });
    expect(reviewed.actor).toBe('Judicial officers in New South Wales courts');
    expect(reviewed.source).toEqual(requirement().source);
    expect(writeJsonFile).toHaveBeenCalledWith(
      expect.stringMatching(/court-requirements\.json$/),
      [expect.objectContaining({ verification: reviewed.verification })],
    );
  });

  it('requires a rejection reason and current source evidence', async () => {
    mockData([requirement()]);
    await expect(
      reviewCourtRequirement({
        id: 'requirement-1',
        decision: 'rejected',
        reviewer: 'Jane Reviewer',
        notes: '   ',
      }),
    ).rejects.toThrow('rejection reason');

    mockData([requirement()], [policy('b'.repeat(64))]);
    await expect(
      reviewCourtRequirement({
        id: 'requirement-1',
        decision: 'verified',
        reviewer: 'Jane Reviewer',
        notes: 'Compared against the current official source evidence.',
      }),
    ).rejects.toThrow('must match the verified policy source');
    expect(writeJsonFile).not.toHaveBeenCalled();

    await expect(
      reviewCourtRequirement({
        id: 'requirement-1',
        decision: 'rejected',
        reviewer: 'Jane Reviewer',
        notes: 'The candidate belongs to an earlier source version.',
      }),
    ).resolves.toMatchObject({ verification: { status: 'rejected' } });
  });

  it('withholds verified requirements when the policy source version changes', async () => {
    const stale = requirement({
      verification: {
        status: 'verified',
        reviewedAt: '2026-08-26T01:00:00Z',
        reviewedBy: 'Jane Reviewer',
        notes: 'Compared against paragraph 4.',
      },
    });
    readJsonFile.mockResolvedValue([stale]);
    getPolicies.mockResolvedValue([policy('b'.repeat(64))]);

    await expect(getPublicCourtRequirements()).resolves.toEqual([]);
  });

  it('orders verified requirements by natural source pinpoint order', async () => {
    const verified = {
      status: 'verified' as const,
      reviewedAt: '2026-08-26T01:00:00Z',
      reviewedBy: 'Jane Reviewer',
      notes: 'Compared against the official source.',
    };
    readJsonFile.mockResolvedValue([
      requirement({
        id: 'paragraph-10',
        source: { ...requirement().source, locator: 'paragraph 10' },
        verification: verified,
      }),
      requirement({
        id: 'paragraph-4',
        source: { ...requirement().source, locator: 'paragraph 4' },
        verification: verified,
      }),
    ]);
    getPolicies.mockResolvedValue([policy()]);

    await expect(
      getPublicCourtRequirements().then((rows) => rows.map((row) => row.id)),
    ).resolves.toEqual(['paragraph-4', 'paragraph-10']);
  });

  it('lists pending candidates with their instrument context', async () => {
    mockData([
      requirement(),
      requirement({
        id: 'requirement-2',
        verification: {
          status: 'rejected',
          reviewedAt: '2026-08-26T01:00:00Z',
          reviewedBy: 'Jane Reviewer',
          notes: 'The proposition overstated the source.',
        },
      }),
    ]);

    const result = await getCourtRequirementsForReview({
      status: 'pending_review',
    });

    expect(result.total).toBe(1);
    expect(result.requirements[0]).toMatchObject({
      id: 'requirement-1',
      policy: { id: 'court-policy', title: 'National AI Ethics Framework' },
    });
  });
});
