/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Development,
  Policy,
  PolicyDraft,
  SourceReview,
} from '@/types';

const {
  analyseContentRelevance,
  createPolicy,
  createSourceReview,
  createTimelineEvent,
  extractRetrievedDocument,
  getDevelopments,
  getPolicies,
  getSourceReviewById,
  getSourceReviews,
  getTimelineEvents,
  logMcpAuditEvent,
  markCollectionReviewed,
  retrieveSource,
  sourceUrlExists,
  upsertDevelopment,
  upsertManualSourceReview,
  updateDevelopment,
  updatePolicy,
  updateTimelineEvent,
  updateSourceReview,
} = vi.hoisted(() => ({
  analyseContentRelevance: vi.fn(),
  createPolicy: vi.fn(),
  createSourceReview: vi.fn(),
  createTimelineEvent: vi.fn(),
  extractRetrievedDocument: vi.fn(),
  getDevelopments: vi.fn(),
  getPolicies: vi.fn(),
  getSourceReviewById: vi.fn(),
  getSourceReviews: vi.fn(),
  getTimelineEvents: vi.fn(),
  logMcpAuditEvent: vi.fn(),
  markCollectionReviewed: vi.fn(),
  retrieveSource: vi.fn(),
  sourceUrlExists: vi.fn(),
  upsertDevelopment: vi.fn(),
  upsertManualSourceReview: vi.fn(),
  updateDevelopment: vi.fn(),
  updatePolicy: vi.fn(),
  updateTimelineEvent: vi.fn(),
  updateSourceReview: vi.fn(),
}));

vi.mock('@/lib/analysis', () => ({ analyseContentRelevance }));
vi.mock('@/lib/pipeline/content', () => ({ extractRetrievedDocument }));
vi.mock('@/lib/pipeline/fetch', () => ({ retrieveSource }));
vi.mock('@/lib/data-service', () => ({
  createPolicy,
  createSourceReview,
  createTimelineEvent,
  getDevelopments,
  getPolicies,
  getSourceReviewById,
  getSourceReviews,
  getTimelineEvents,
  logMcpAuditEvent,
  markCollectionReviewed,
  sourceUrlExists,
  upsertDevelopment,
  upsertManualSourceReview,
  updateDevelopment,
  updatePolicy,
  updateTimelineEvent,
  updateSourceReview,
}));

import {
  approveStagedSource,
  policyRevisionHash,
  publishStagedSource,
  recordManualSourceReview,
  rejectStagedSource,
  stageSourceUrl,
} from './source-ingest';
import { timelineRevisionHash } from './policy-revision';

const SOURCE_URL = 'https://example.gov.au/policy';
const DISCOVERY_URL = 'https://policy.example.com/analysis';

function buildDraft(overrides: Partial<PolicyDraft> = {}): PolicyDraft {
  const dates =
    overrides.dates ??
    (overrides.effectiveDate
      ? [
          {
            type: 'published' as const,
            date: overrides.effectiveDate,
            precision: 'day' as const,
            primary: true,
            source: {
              url: SOURCE_URL,
              contentHash: 'a'.repeat(64),
              publishedAt:
                overrides.effectiveDate instanceof Date
                  ? overrides.effectiveDate.toISOString().slice(0, 10)
                  : overrides.effectiveDate,
              publishedAtPrecision: 'day' as const,
            },
          },
        ]
      : undefined);
  return {
    id: 'draft-policy',
    title: 'Draft AI policy',
    description: 'A source-backed policy description.',
    jurisdiction: 'federal',
    type: 'policy',
    status: 'active',
    agencies: ['Example Department'],
    sourceUrl: SOURCE_URL,
    content: 'Verified key policy details.',
    aiSummary: 'Machine-assisted summary.',
    tags: ['ai'],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    dates,
    ...overrides,
  };
}

function buildReview(
  overrides: Partial<SourceReview> = {},
): SourceReview {
  return {
    id: 'source-review-1',
    sourceUrl: SOURCE_URL,
    title: 'Draft AI policy',
    entryKind: 'policy',
    status: 'pending_review',
    discoveredAt: '2026-07-16T00:00:00.000Z',
    createdBy: 'collector',
    analysis: {
      isRelevant: true,
      relevanceScore: 0.9,
      suggestedType: 'policy',
      suggestedJurisdiction: 'federal',
      summary: 'A source-backed policy description.',
    },
    sourceEvidence: {
      url: SOURCE_URL,
      retrievedAt: '2026-07-16T00:00:00.000Z',
      contentHash: 'a'.repeat(64),
    },
    proposedRecord: buildDraft(),
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function buildLinkedDevelopment(
  overrides: Partial<Development> = {},
): Development {
  return {
    id: 'dev-policy-update',
    title: 'Detected AI policy',
    url: SOURCE_URL,
    sourceId: 'test-source',
    sourceName: 'Test source',
    jurisdiction: 'federal',
    detectedAt: '2026-07-16T00:00:00.000Z',
    summary: 'Detected source-backed policy development.',
    relevanceScore: 0.9,
    classification: 'heuristic',
    assessment: {
      method: 'heuristic',
      assessedAt: '2026-07-16T00:00:00.000Z',
      promptVersion: 'test',
    },
    verification: {
      status: 'needs_review',
      source: { url: SOURCE_URL },
    },
    status: 'detected',
    ...overrides,
  };
}

describe('source ingest approval workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDevelopments.mockResolvedValue([]);
    getPolicies.mockResolvedValue([]);
    getSourceReviews.mockResolvedValue([]);
    getTimelineEvents.mockResolvedValue([]);
    sourceUrlExists.mockResolvedValue(false);
    retrieveSource.mockResolvedValue({
      body: '<main>Official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'a'.repeat(64),
      },
    });
    extractRetrievedDocument.mockResolvedValue({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
      publishedAt: '2026-07-01',
      publishedAtPrecision: 'day',
    });
    analyseContentRelevance.mockResolvedValue({
      isRelevant: true,
      relevanceScore: 0.8,
      policyType: 'policy',
      jurisdiction: 'federal',
      summary: 'Relevant official AI policy.',
      tags: ['ai'],
      agencies: ['Example Department'],
      keyDates: [],
      relatedTopics: [],
    });
    createSourceReview.mockImplementation(async (review) => review);
    updatePolicy.mockImplementation(async (_id, policy) => policy);
    updateTimelineEvent.mockImplementation(async (_id, event) => event);
    updateDevelopment.mockResolvedValue({ id: 'existing-development' });
    upsertDevelopment.mockImplementation(async (development) => development);
    upsertManualSourceReview.mockImplementation(async (review) => ({
      manualReviews: [review],
    }));
    updateSourceReview.mockImplementation(
      async (_id: string, updates: Partial<SourceReview>) => ({
        ...buildReview(),
        ...updates,
      }),
    );
  });

  it('excludes automated retrieval metadata from the editorial policy revision', () => {
    const draft = buildDraft({ effectiveDate: '2026-07-01' });
    const policy: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          retrievedAt: '2026-07-01T00:00:00.000Z',
          etag: '"old"',
        },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
        lastSourceAuditAt: '2026-07-01T00:00:00.000Z',
      },
    };
    const audited = {
      ...policy,
      verification: {
        ...policy.verification,
        source: {
          ...policy.verification.source,
          finalUrl: 'https://example.gov.au/canonical-policy',
          retrievedAt: '2026-07-16T00:00:00.000Z',
          etag: '"new"',
          lastModified: 'Thu, 16 Jul 2026 00:00:00 GMT',
        },
        lastSourceAuditAt: '2026-07-16T00:00:00.000Z',
      },
    };

    expect(policyRevisionHash(audited)).toBe(
      policyRevisionHash(policy),
    );
    expect(
      policyRevisionHash({
        ...audited,
        verification: {
          ...audited.verification,
          source: {
            ...audited.verification.source,
            contentHash: 'b'.repeat(64),
          },
        },
      }),
    ).not.toBe(policyRevisionHash(policy));
  });

  it('includes manual extraction provenance in the editorial policy revision', () => {
    const draft = buildDraft({ effectiveDate: '2026-07-01' });
    const policy: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          manualExtraction: {
            method: 'ocr',
            extractedAt: '2026-07-01T00:00:00.000Z',
            extractedBy: 'first-reviewer',
            notes: 'OCR checked against the source image.',
            textHash: 'b'.repeat(64),
            characterCount: 1200,
          },
        },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'first-reviewer',
        method: 'manual',
      },
    };
    const revised: Policy = {
      ...policy,
      verification: {
        ...policy.verification,
        source: {
          ...policy.verification.source,
          manualExtraction: {
            ...policy.verification.source.manualExtraction!,
            extractedBy: 'second-reviewer',
          },
        },
      },
    };

    expect(policyRevisionHash(revised)).not.toBe(policyRevisionHash(policy));
  });

  it('refuses approval when the official source supplied no date', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
    });

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('labelled primary policy date is required');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('rejects an editor-supplied primary date without source-backed evidence', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
    });

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: buildDraft({ effectiveDate: '2026-07-01' }),
      }),
    ).rejects.toThrow('explicit reviewedDate evidence');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('binds explicit reviewed date evidence to the current source fingerprint', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
    });

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'Jane Reviewer',
      proposedRecord: buildDraft({ effectiveDate: '2026-07-01' }),
      reviewedDate: {
        date: '2026-07-01',
        precision: 'day',
        notes: 'Confirmed the publication date in the official instrument.',
      },
    });

    expect(approved).toMatchObject({
      sourceEvidence: {
        contentHash: 'a'.repeat(64),
        reviewedDate: {
          date: '2026-07-01',
          precision: 'day',
          reviewedBy: 'Jane Reviewer',
          notes: 'Confirmed the publication date in the official instrument.',
        },
      },
      proposedRecord: {
        dates: [
          {
            source: {
              contentHash: 'a'.repeat(64),
              reviewedDate: {
                date: '2026-07-01',
                reviewedBy: 'Jane Reviewer',
              },
            },
          },
        ],
      },
    });
  });

  it('does not stamp unsupported non-primary dates with primary evidence', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
      proposedRecord: buildDraft({
        dates: [
          {
            type: 'published',
            date: '2026-07-01',
            precision: 'day',
            primary: true,
          },
          {
            type: 'effective',
            date: '2026-07-15',
            precision: 'day',
          },
        ],
      }),
    });

    const policy = approved.proposedRecord as Policy;
    expect(policy.dates[0].source).toMatchObject({ contentHash: 'a'.repeat(64) });
    expect(policy.dates[1].source).toBeUndefined();
  });

  it('links a manually staged source to an existing radar development', async () => {
    const linkedDevelopment = {
      id: 'dev-existing-radar-lead',
      title: 'Existing radar lead',
      url: SOURCE_URL,
      sourceId: 'test-source',
      sourceName: 'Test source',
      jurisdiction: 'federal' as const,
      detectedAt: '2026-07-15T00:00:00.000Z',
      relevanceScore: 0.7,
      classification: 'heuristic' as const,
      assessment: {
        method: 'heuristic' as const,
        assessedAt: '2026-07-15T00:00:00.000Z',
        promptVersion: 'test',
      },
      verification: {
        status: 'needs_review' as const,
        source: { url: SOURCE_URL },
      },
      status: 'detected' as const,
    };
    getDevelopments.mockResolvedValue([linkedDevelopment]);

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: SOURCE_URL,
        linkedDevelopment,
      }),
    );
  });

  it('canonicalizes source identity before staging and duplicate checks', async () => {
    await stageSourceUrl({
      url: `${SOURCE_URL}/?utm_source=email#details`,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(sourceUrlExists).toHaveBeenCalledWith(SOURCE_URL);
    expect(retrieveSource).toHaveBeenCalledWith(SOURCE_URL, {
      destinationPolicy: 'official',
    });
    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: SOURCE_URL,
        sourceEvidence: expect.objectContaining({ url: SOURCE_URL }),
      }),
    );
  });

  it('refreshes an unresolved new-source review in place after source drift', async () => {
    const linkedDevelopment = buildLinkedDevelopment();
    const existingReview = buildReview({
      status: 'approved',
      linkedDevelopment,
      reviewedAt: '2026-07-15T00:00:00.000Z',
      reviewedBy: 'first-reviewer',
      approvalNotes: 'Approved before the source changed.',
      sourceEvidence: {
        url: SOURCE_URL,
        retrievedAt: '2026-07-15T00:00:00.000Z',
        contentHash: 'a'.repeat(64),
      },
    });
    getSourceReviews.mockResolvedValue([existingReview]);
    sourceUrlExists.mockResolvedValue(true);
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Updated official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'second-reviewer',
    });

    expect(sourceUrlExists).not.toHaveBeenCalled();
    expect(updateSourceReview).toHaveBeenCalledWith(
      existingReview.id,
      expect.objectContaining({
        status: 'pending_review',
        createdBy: existingReview.createdBy,
        linkedDevelopment,
        sourceEvidence: expect.objectContaining({
          contentHash: 'b'.repeat(64),
        }),
        reviewedAt: undefined,
        reviewedBy: undefined,
        approvalNotes: undefined,
      }),
    );
    expect(createSourceReview).not.toHaveBeenCalled();
  });

  it('rejects a redirect alias whose destination is already tracked', async () => {
    const aliasUrl = 'https://alias.example.gov.au/ai-policy';
    const existingDraft = buildDraft({
      id: 'existing-canonical-policy',
      sourceUrl: SOURCE_URL,
      effectiveDate: '2026-07-01',
    });
    const existingPolicy: Policy = {
      ...existingDraft,
      effectiveDate: '2026-07-01',
      dates: existingDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([existingPolicy]);
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: aliasUrl,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'a'.repeat(64),
      },
    });

    await expect(
      stageSourceUrl({
        url: aliasUrl,
        entryKind: 'policy',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('redirected source URL already exists');
    expect(createSourceReview).not.toHaveBeenCalled();
  });

  it('stages a tracked policy source as an explicit re-verification review', async () => {
    const target: Policy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [
        {
          type: 'published',
          date: '2026-07-01',
          precision: 'day',
          primary: true,
        },
      ],
      lastReviewedAt: '2026-01-01T00:00:00.000Z',
      verification: {
        status: 'verified',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target]);

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(sourceUrlExists).not.toHaveBeenCalled();
    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: SOURCE_URL,
        title: target.title,
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        status: 'pending_review',
        notes:
          'Existing tracked record staged for explicit editorial re-verification.',
        proposedRecord: expect.objectContaining({
          id: target.id,
          sourceUrl: SOURCE_URL,
        }),
      }),
    );
    const staged = createSourceReview.mock.calls[0][0] as SourceReview;
    expect(staged.proposedRecord).not.toHaveProperty('verification');
    expect(staged.proposedRecord).not.toHaveProperty('lastReviewedAt');
  });

  it('rejects tracked re-verification that redirects to another policy identity', async () => {
    const otherUrl = 'https://example.gov.au/other-policy';
    const targetDraft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const otherDraft = buildDraft({
      id: 'other-policy',
      sourceUrl: otherUrl,
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...targetDraft,
      effectiveDate: '2026-07-01',
      dates: targetDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const other: Policy = {
      ...otherDraft,
      effectiveDate: '2026-07-01',
      dates: otherDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: otherUrl, contentHash: 'b'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target, other]);
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Other official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: otherUrl,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      stageSourceUrl({
        url: SOURCE_URL,
        entryKind: 'policy',
        targetRecordId: target.id,
        actor: 'reviewer',
      }),
    ).rejects.toThrow('identity owned by another record or review');
    expect(createSourceReview).not.toHaveBeenCalled();
  });

  it('stages an unreadable tracked source for manual extraction at approval', async () => {
    const draft = buildDraft({
      id: 'image-only-policy',
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target]);
    retrieveSource.mockResolvedValueOnce({
      body: '%PDF-1.4 image-only document',
      bytes: Uint8Array.from(Buffer.from('%PDF-1.4 image-only document')),
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'application/pdf',
        contentHash: 'b'.repeat(64),
      },
    });
    extractRetrievedDocument.mockRejectedValueOnce(
      new Error('PDF contains no extractable text; OCR is required'),
    );

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(analyseContentRelevance).not.toHaveBeenCalled();
    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPolicyId: target.id,
        notes: expect.stringContaining('approval requires reviewed OCR'),
        sourceEvidence: expect.objectContaining({
          contentHash: 'b'.repeat(64),
          contentType: 'application/pdf',
        }),
        analysis: expect.objectContaining({
          isRelevant: true,
          summary: target.description,
        }),
      }),
    );
  });

  it('uses entry kind to disambiguate policy and timeline records sharing a source', async () => {
    const draft = buildDraft({
      id: 'shared-source-policy',
      effectiveDate: '2026-07-01',
    });
    const policy: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const timelineEvent = {
      id: 'shared-source-timeline-event',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'Shared-source announcement',
      description: 'Timeline context from the same official source.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: policy.verification,
    };
    getPolicies.mockResolvedValue([policy]);
    getTimelineEvents.mockResolvedValue([timelineEvent]);

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPolicyId: policy.id,
        proposedRecord: expect.objectContaining({ id: policy.id }),
      }),
    );
  });

  it('requires a target record id when timeline records share a source', async () => {
    const timelineEvents = ['first-event', 'second-event'].map((id) => ({
      id,
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: id,
      description: 'Source-backed timeline context.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    }));
    getTimelineEvents.mockResolvedValue(timelineEvents);

    await expect(
      stageSourceUrl({
        url: SOURCE_URL,
        entryKind: 'timeline_event',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('targetRecordId is required');

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'timeline_event',
      targetRecordId: timelineEvents[1].id,
      actor: 'reviewer',
    });
    expect(createSourceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        targetTimelineEventId: timelineEvents[1].id,
        proposedRecord: expect.objectContaining({ id: timelineEvents[1].id }),
      }),
    );
  });

  it('refreshes an unresolved re-verification review in place after source drift', async () => {
    const draft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target]);
    getSourceReviews.mockResolvedValue([
      buildReview({
        id: 'existing-reverification',
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        targetPolicyRevisionHash: policyRevisionHash(target),
        status: 'approved',
        reviewedAt: '2026-07-15T00:00:00.000Z',
        reviewedBy: 'first-reviewer',
        approvalNotes: 'Previously reviewed before the source drifted.',
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
      }),
    ]);

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(updateSourceReview).toHaveBeenCalledWith(
      'existing-reverification',
      expect.objectContaining({
        status: 'pending_review',
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        targetPolicyRevisionHash: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
        sourceEvidence: expect.objectContaining({
          contentHash: 'a'.repeat(64),
        }),
      }),
    );
    expect(createSourceReview).not.toHaveBeenCalled();
  });

  it('preserves a collector transition sequence when refreshing the same source version', async () => {
    const draft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: '0'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const linkedDevelopment = buildLinkedDevelopment();
    const existingReview = buildReview({
      id: 'collector-transition-review',
      targetPolicyId: target.id,
      sourceVersionSequence: 4,
      discoveredAt: '2026-07-15T00:00:00.000Z',
      sourceEvidence: {
        url: SOURCE_URL,
        retrievedAt: '2026-07-15T00:00:00.000Z',
        contentHash: 'a'.repeat(64),
      },
      linkedDevelopment,
    });
    getPolicies.mockResolvedValue([target]);
    getSourceReviews.mockResolvedValue([existingReview]);

    await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: 'reviewer',
    });

    expect(updateSourceReview).toHaveBeenCalledWith(
      existingReview.id,
      expect.objectContaining({
        sourceVersionSequence: 4,
        discoveredAt: existingReview.discoveredAt,
        linkedDevelopment,
      }),
    );
  });

  it('refuses to rewrite an ordered collector review as a different source version', async () => {
    const draft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...draft,
      effectiveDate: '2026-07-01',
      dates: draft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: '0'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target]);
    getSourceReviews.mockResolvedValue([
      buildReview({
        id: 'collector-transition-review',
        targetPolicyId: target.id,
        sourceVersionSequence: 4,
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
      }),
    ]);

    await expect(
      stageSourceUrl({
        url: SOURCE_URL,
        entryKind: 'policy',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('run collection again');
    expect(updateSourceReview).not.toHaveBeenCalled();
    expect(createSourceReview).not.toHaveBeenCalled();
  });

  it('re-verifies a tracked timeline event whose source is shared by tracked records', async () => {
    const relatedPolicyDraft = buildDraft({
      id: 'related-policy',
      effectiveDate: '2026-07-01',
    });
    const relatedPolicy: Policy = {
      ...relatedPolicyDraft,
      effectiveDate: '2026-07-01',
      dates: relatedPolicyDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const targetEvent = {
      id: 'existing-timeline-event',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'Existing AI policy announcement',
      description: 'Existing source-backed timeline description.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      relatedPolicyId: relatedPolicy.id,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const siblingEvent = {
      ...targetEvent,
      id: 'sibling-timeline-event',
      title: 'Related milestone from the same official source',
    };
    getPolicies.mockResolvedValue([relatedPolicy]);
    getTimelineEvents.mockResolvedValue([targetEvent, siblingEvent]);
    getSourceReviews.mockResolvedValue([
      buildReview({
        id: 'related-policy-review',
        targetPolicyId: relatedPolicy.id,
      }),
    ]);

    const staged = await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'timeline_event',
      targetRecordId: targetEvent.id,
      actor: 'reviewer',
    });

    expect(sourceUrlExists).not.toHaveBeenCalled();
    expect(staged).toMatchObject({
      entryKind: 'timeline_event',
      proposedRecord: {
        id: targetEvent.id,
        sourceUrl: SOURCE_URL,
      },
      targetTimelineEventId: targetEvent.id,
      targetTimelineRevisionHash: timelineRevisionHash(targetEvent),
    });
    expect(staged.proposedRecord).not.toHaveProperty('verification');

    getSourceReviewById.mockResolvedValue(staged);
    updateSourceReview.mockImplementationOnce(async (_id, updates) => ({
      ...staged,
      ...updates,
    }));
    const approved = await approveStagedSource({
      id: staged.id,
      actor: 'timeline-reviewer',
    });
    getSourceReviewById.mockResolvedValue(approved);

    await publishStagedSource(staged.id);

    expect(approved).toMatchObject({
      status: 'approved',
      targetTimelineEventId: targetEvent.id,
      targetTimelineRevisionHash: timelineRevisionHash(targetEvent),
      proposedRecord: {
        id: targetEvent.id,
        verification: {
          status: 'verified',
          checkedBy: 'timeline-reviewer',
          method: 'manual',
        },
      },
    });
    expect(updateTimelineEvent).toHaveBeenCalledWith(
      targetEvent.id,
      expect.objectContaining({
        id: targetEvent.id,
        sourceUrl: SOURCE_URL,
      }),
    );
  });

  it('keeps a timeline re-verification review bound to its staged event', async () => {
    const replacementUrl = 'https://example.gov.au/replacement-timeline-source';
    const review = buildReview({
      entryKind: 'timeline_event',
      targetTimelineEventId: 'tracked-timeline-event',
      targetTimelineRevisionHash: 'a'.repeat(64),
      proposedRecord: {
        id: 'tracked-timeline-event',
        date: '2026-07-01',
        datePrecision: 'day',
        title: 'Tracked timeline event',
        description: 'Original source-backed event.',
        type: 'announcement',
        jurisdiction: 'federal',
        sourceUrl: SOURCE_URL,
      },
    });
    getSourceReviewById.mockResolvedValue(review);

    await expect(
      approveStagedSource({
        id: review.id,
        actor: 'reviewer',
        officialSourceUrl: replacementUrl,
        proposedRecord: {
          id: 'replacement-event',
          date: '2026-07-02',
          datePrecision: 'day',
          title: 'Replacement timeline event',
          description: 'A different event that must not detach the review.',
          type: 'announcement',
          jurisdiction: 'federal',
          sourceUrl: replacementUrl,
        },
      }),
    ).rejects.toThrow('cannot replace their canonical source URL');
    expect(retrieveSource).not.toHaveBeenCalled();
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('rejects a stale submitted draft when a target timeline event changed after staging', async () => {
    const stagedEvent = {
      id: 'tracked-timeline-event',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'Tracked timeline event',
      description: 'Original source-backed event.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const editedEvent = {
      ...stagedEvent,
      title: 'Editorially corrected timeline title',
    };
    getTimelineEvents.mockResolvedValue([editedEvent]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        entryKind: 'timeline_event',
        targetTimelineEventId: stagedEvent.id,
        targetTimelineRevisionHash: timelineRevisionHash(stagedEvent),
        proposedRecord: stagedEvent,
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: stagedEvent,
      }),
    ).rejects.toThrow('expectedTargetRevisionHash');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('stamps verification metadata during explicit approval', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
      approvalNotes: 'Checked against the official instrument.',
      proposedRecord: buildDraft({ effectiveDate: '2026-07-01' }),
    });

    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('reviewer');
    expect(approved.proposedRecord).toMatchObject({
      effectiveDate: '2026-07-01',
      verification: {
        status: 'verified',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    });
    expect(retrieveSource).toHaveBeenCalledWith(SOURCE_URL);
  });

  it('refuses approval when a new-policy draft id belongs to another policy', async () => {
    const existingDraft = buildDraft({
      id: 'draft-policy',
      sourceUrl: 'https://example.gov.au/existing-policy',
      effectiveDate: '2026-06-01',
    });
    const existingPolicy: Policy = {
      ...existingDraft,
      effectiveDate: '2026-06-01',
      dates: existingDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/existing-policy',
          contentHash: 'c'.repeat(64),
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getSourceReviewById.mockResolvedValue(buildReview());
    getPolicies.mockResolvedValue([existingPolicy]);

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: buildDraft({ effectiveDate: '2026-07-01' }),
      }),
    ).rejects.toThrow('already used by an existing register record');

    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('refuses approval when a timeline draft id belongs to another event', async () => {
    const proposedEvent = {
      id: 'timeline-collision',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'New AI policy event',
      description: 'A new source-backed timeline event.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
    };
    const existingEvent = {
      ...proposedEvent,
      title: 'Existing unrelated event',
      sourceUrl: 'https://example.gov.au/existing-event',
      verification: {
        status: 'verified' as const,
        source: {
          url: 'https://example.gov.au/existing-event',
          contentHash: 'c'.repeat(64),
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        entryKind: 'timeline_event',
        proposedRecord: proposedEvent,
      }),
    );
    getTimelineEvents.mockResolvedValue([existingEvent]);

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: proposedEvent,
      }),
    ).rejects.toThrow('already used by an existing record');

    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('re-approves and updates the matching partial policy publication', async () => {
    const oldDraft = buildDraft({
      id: 'partial-policy',
      effectiveDate: '2026-07-01',
    });
    const partialPolicy: Policy = {
      ...oldDraft,
      effectiveDate: '2026-07-01',
      dates: oldDraft.dates ?? [],
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const review = buildReview({
      status: 'approved',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      proposedRecord: partialPolicy,
    });
    getSourceReviewById.mockResolvedValue(review);
    getPolicies.mockResolvedValue([partialPolicy]);

    await approveStagedSource({
      id: review.id,
      actor: 'second-reviewer',
      proposedRecord: buildDraft({
        id: partialPolicy.id,
        effectiveDate: '2026-07-01',
        description: 'Re-approved source-backed description.',
      }),
    });

    expect(updateSourceReview).toHaveBeenCalledWith(
      review.id,
      expect.objectContaining({
        status: 'approved',
        targetPolicyId: partialPolicy.id,
        targetPolicyRevisionHash: policyRevisionHash(partialPolicy),
      }),
    );
  });

  it('re-approves and updates the matching partial timeline publication', async () => {
    const partialEvent = {
      id: 'partial-timeline-event',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'AI policy event',
      description: 'Original approved description.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const review = buildReview({
      entryKind: 'timeline_event',
      status: 'approved',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      proposedRecord: partialEvent,
    });
    const revisedDraft = {
      ...partialEvent,
      description: 'Re-approved source-backed description.',
      verification: undefined,
    };
    getSourceReviewById.mockResolvedValue(review);
    getTimelineEvents.mockResolvedValue([partialEvent]);
    updateSourceReview.mockImplementationOnce(async (_id, updates) => ({
      ...review,
      ...updates,
    }));

    const reapproved = await approveStagedSource({
      id: review.id,
      actor: 'second-reviewer',
      proposedRecord: revisedDraft,
    });
    getSourceReviewById.mockResolvedValue(reapproved);

    await publishStagedSource(review.id);

    expect(reapproved.targetTimelineRevisionHash).toEqual(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(updateTimelineEvent).toHaveBeenCalledWith(
      partialEvent.id,
      expect.objectContaining({
        id: partialEvent.id,
        description: revisedDraft.description,
      }),
    );
  });

  it('does not promote a timeline development before publication is terminal', async () => {
    const event = {
      id: 'timeline-publication-boundary',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'AI policy event',
      description: 'Editorially verified timeline development.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const linkedDevelopment = {
      id: 'dev-timeline-publication-boundary',
      title: event.title,
      url: SOURCE_URL,
      sourceId: 'test-source',
      sourceName: 'Test source',
      jurisdiction: 'federal' as const,
      detectedAt: '2026-07-16T00:00:00.000Z',
      summary: event.description,
      relevanceScore: 1,
      classification: 'heuristic' as const,
      assessment: {
        method: 'heuristic' as const,
        assessedAt: '2026-07-16T00:00:00.000Z',
        promptVersion: 'test',
      },
      verification: {
        status: 'needs_review' as const,
        source: { url: SOURCE_URL },
      },
      status: 'detected' as const,
    };
    const review = buildReview({
      id: 'source-review-dev-timeline-publication-boundary',
      entryKind: 'timeline_event',
      status: 'approved',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      proposedRecord: event,
      linkedDevelopment,
    });
    getSourceReviewById.mockResolvedValue(review);
    updateSourceReview.mockRejectedValueOnce(
      new Error('terminal review write failed'),
    );

    await expect(publishStagedSource(review.id)).rejects.toThrow(
      'terminal review write failed',
    );

    expect(createTimelineEvent).toHaveBeenCalledWith(event, {
      excludeSourceReviewId: review.id,
    });
    expect(updateDevelopment).not.toHaveBeenCalled();
    expect(upsertDevelopment).not.toHaveBeenCalled();
    expect(markCollectionReviewed).not.toHaveBeenCalled();
  });

  it('refuses approval when the official source changed after staging', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Changed official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: buildDraft({ effectiveDate: '2026-07-01' }),
      }),
    ).rejects.toThrow('changed after staging');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('refuses approval when staged evidence has no fingerprint', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-16T00:00:00.000Z',
        },
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('must be re-staged');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('approves an unreadable changed document only with reviewed OCR evidence', async () => {
    const targetDraft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...targetDraft,
      effectiveDate: '2026-07-01',
      dates: targetDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const changedHash = 'b'.repeat(64);
    getPolicies.mockResolvedValue([target]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-16T00:00:00.000Z',
          contentHash: changedHash,
        },
        proposedRecord: target,
      }),
    );
    retrieveSource.mockResolvedValueOnce({
      body: '%PDF-1.4 image-only document',
      bytes: Uint8Array.from(Buffer.from('%PDF-1.4 image-only document')),
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'application/pdf',
        contentHash: changedHash,
      },
    });
    extractRetrievedDocument.mockRejectedValueOnce(
      new Error('PDF contains no extractable text; OCR is required'),
    );
    const ocrText =
      'OCR transcription of the changed official AI policy instrument.';

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
      proposedRecord: {
        ...target,
        description: 'Reviewed description of the changed instrument.',
      },
      approvalNotes: 'Compared the OCR output with every page of the PDF.',
      manualExtraction: {
        method: 'ocr',
        title: 'Changed official AI policy',
        text: ocrText,
        publishedAt: '2026-07-01',
        publishedAtPrecision: 'day',
        notes: 'OCR output manually checked against the image-only PDF.',
      },
    });

    expect(approved).toMatchObject({
      status: 'approved',
      sourceEvidence: {
        contentHash: changedHash,
        manualExtraction: {
          method: 'ocr',
          extractedBy: 'reviewer',
          notes: expect.stringContaining('OCR output manually checked'),
          textHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          characterCount: ocrText.length,
        },
      },
      proposedRecord: {
        id: target.id,
        verification: {
          source: {
            contentHash: changedHash,
            manualExtraction: expect.objectContaining({ method: 'ocr' }),
          },
        },
      },
    });
  });

  it('re-fetches an official source before approving a stage-only lead', async () => {
    const linkedDevelopment = {
      id: 'dev-stage-only-policy',
      title: 'Discovery-source policy lead',
      url: DISCOVERY_URL,
      sourceId: 'manual-stage',
      sourceName: 'Manual stage',
      jurisdiction: 'federal' as const,
      detectedAt: '2026-07-15T00:00:00.000Z',
      relevanceScore: 0.7,
      classification: 'heuristic' as const,
      assessment: {
        method: 'heuristic' as const,
        assessedAt: '2026-07-15T00:00:00.000Z',
        promptVersion: 'test',
      },
      verification: {
        status: 'needs_review' as const,
        source: { url: DISCOVERY_URL },
      },
      status: 'detected' as const,
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceUrl: DISCOVERY_URL,
        sourceEvidence: {
          url: DISCOVERY_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'a'.repeat(64),
        },
        proposedRecord: buildDraft({
          sourceUrl: DISCOVERY_URL,
          dates: [
            {
              type: 'published',
              date: '2026-07-01',
              precision: 'day',
              primary: true,
              source: {
                url: DISCOVERY_URL,
                retrievedAt: '2026-07-15T00:00:00.000Z',
              },
            },
          ],
        }),
        linkedDevelopment,
      }),
    );
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
      publishedAt: '2026-07-01',
      publishedAtPrecision: 'month',
    });

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
      officialSourceUrl: SOURCE_URL,
      proposedRecord: buildDraft({
        title: 'Official AI policy',
        description: 'Official source-backed policy description.',
        sourceUrl: SOURCE_URL,
        content: 'Official source-backed policy text.',
        aiSummary: 'Editorial summary of the official policy.',
        dates: [
          {
            type: 'published',
            date: '2026-07-01',
            precision: 'month',
            primary: true,
          },
        ],
      }),
      approvalNotes: 'Matched the lead to the official publication.',
    });

    expect(retrieveSource).toHaveBeenCalledWith(SOURCE_URL);
    expect(extractRetrievedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.objectContaining({ url: SOURCE_URL }),
      }),
      SOURCE_URL,
      'example.gov.au',
    );
    expect(approved).toMatchObject({
      sourceUrl: SOURCE_URL,
      sourceEvidence: {
        url: SOURCE_URL,
        publishedAt: '2026-07-01',
        publishedAtPrecision: 'month',
      },
      linkedDevelopment: {
        id: linkedDevelopment.id,
        title: 'Official AI policy',
        url: SOURCE_URL,
        verification: {
          status: 'needs_review',
          source: { url: SOURCE_URL },
        },
      },
      proposedRecord: {
        sourceUrl: SOURCE_URL,
        dates: [
          {
            source: { url: SOURCE_URL },
          },
        ],
        verification: {
          source: { url: SOURCE_URL },
        },
      },
    });
  });

  it('rebases a timeline radar snapshot when approval replaces its source', async () => {
    const linkedDevelopment = {
      id: 'dev-stage-only-timeline',
      title: 'Discovery-source timeline lead',
      url: DISCOVERY_URL,
      sourceId: 'manual-stage',
      sourceName: 'Manual stage',
      jurisdiction: 'federal' as const,
      detectedAt: '2026-07-15T00:00:00.000Z',
      relevanceScore: 0.7,
      classification: 'heuristic' as const,
      assessment: {
        method: 'heuristic' as const,
        assessedAt: '2026-07-15T00:00:00.000Z',
        promptVersion: 'test',
      },
      verification: {
        status: 'needs_review' as const,
        source: { url: DISCOVERY_URL },
      },
      status: 'detected' as const,
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceUrl: DISCOVERY_URL,
        entryKind: 'timeline_event',
        sourceEvidence: {
          url: DISCOVERY_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'a'.repeat(64),
        },
        proposedRecord: {
          id: 'timeline-discovery-lead',
          date: '2026-07-01',
          datePrecision: 'month',
          title: 'Discovery-source timeline lead',
          description: 'A discovery-source description.',
          type: 'announcement',
          jurisdiction: 'federal',
          sourceUrl: DISCOVERY_URL,
        },
        linkedDevelopment,
      }),
    );
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
      publishedAt: '2026-07-01',
      publishedAtPrecision: 'month',
    });

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
      officialSourceUrl: SOURCE_URL,
      proposedRecord: {
        id: 'timeline-official-policy',
        date: '2026-07-01',
        datePrecision: 'month',
        title: 'Official AI policy announced',
        description: 'Official source-backed announcement.',
        type: 'announcement',
        jurisdiction: 'federal',
        sourceUrl: SOURCE_URL,
      },
    });

    expect(approved.linkedDevelopment).toMatchObject({
      id: linkedDevelopment.id,
      title: 'Official AI policy announced',
      url: SOURCE_URL,
      summary: 'Official source-backed announcement.',
      verification: {
        status: 'needs_review',
        source: { url: SOURCE_URL },
      },
    });
  });

  it('rejects an official policy URL already owned by another record before approval', async () => {
    const existingDraft = buildDraft({
      id: 'existing-policy',
      sourceUrl: SOURCE_URL,
      effectiveDate: '2026-07-01',
    });
    const existingPolicy: Policy = {
      ...existingDraft,
      effectiveDate: '2026-07-01',
      dates: existingDraft.dates ?? [],
      verification: {
        status: 'verified',
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
        },
      },
    };
    getPolicies.mockResolvedValue([existingPolicy]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceUrl: DISCOVERY_URL,
        sourceEvidence: {
          url: DISCOVERY_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
        proposedRecord: buildDraft({ sourceUrl: DISCOVERY_URL }),
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        officialSourceUrl: SOURCE_URL,
        proposedRecord: buildDraft({
          id: 'new-policy',
          sourceUrl: SOURCE_URL,
          effectiveDate: '2026-07-01',
        }),
      }),
    ).rejects.toThrow('already used by tracked or staged content');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('rejects an approved source alias that redirects to a tracked policy', async () => {
    const aliasUrl = 'https://alias.example.gov.au/ai-policy';
    const existingDraft = buildDraft({
      id: 'existing-redirect-destination',
      sourceUrl: SOURCE_URL,
      effectiveDate: '2026-07-01',
    });
    const existingPolicy: Policy = {
      ...existingDraft,
      effectiveDate: '2026-07-01',
      dates: existingDraft.dates ?? [],
      verification: {
        status: 'verified',
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
        },
      },
    };
    getPolicies.mockResolvedValue([existingPolicy]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceUrl: aliasUrl,
        sourceEvidence: {
          url: aliasUrl,
          finalUrl: SOURCE_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'a'.repeat(64),
        },
        proposedRecord: buildDraft({
          id: 'duplicate-via-alias',
          sourceUrl: aliasUrl,
          effectiveDate: '2026-07-01',
        }),
      }),
    );
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: aliasUrl,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'a'.repeat(64),
      },
    });

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('already used by tracked or staged content');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('rejects approval when tracked re-verification adopts another policy redirect', async () => {
    const otherUrl = 'https://example.gov.au/other-policy';
    const targetDraft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const otherDraft = buildDraft({
      id: 'other-policy',
      sourceUrl: otherUrl,
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...targetDraft,
      effectiveDate: '2026-07-01',
      dates: targetDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const other: Policy = {
      ...otherDraft,
      effectiveDate: '2026-07-01',
      dates: otherDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: otherUrl, contentHash: 'b'.repeat(64) },
        checkedAt: '2026-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target, other]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        sourceEvidence: {
          url: SOURCE_URL,
          finalUrl: otherUrl,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
        proposedRecord: buildDraft({
          id: target.id,
          effectiveDate: '2026-07-01',
        }),
      }),
    );
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Other official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: otherUrl,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      approveStagedSource({ id: 'source-review-1', actor: 'reviewer' }),
    ).rejects.toThrow('identity owned by another tracked or staged record');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('rejects an official timeline URL already owned by another event before approval', async () => {
    getTimelineEvents.mockResolvedValue([
      {
        id: 'existing-timeline-event',
        date: '2026-07-01',
        datePrecision: 'day',
        title: 'Existing event',
        description: 'Existing source-backed timeline event.',
        type: 'announcement',
        jurisdiction: 'federal',
        sourceUrl: SOURCE_URL,
        verification: {
          status: 'verified',
          checkedAt: '2026-07-15T00:00:00.000Z',
          checkedBy: 'reviewer',
          method: 'manual',
          source: {
            url: SOURCE_URL,
            contentHash: 'a'.repeat(64),
          },
        },
      },
    ]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceUrl: DISCOVERY_URL,
        entryKind: 'timeline_event',
        sourceEvidence: {
          url: DISCOVERY_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
        proposedRecord: {
          id: 'timeline-discovery-lead',
          date: '2026-07-01',
          datePrecision: 'day',
          title: 'Discovery lead',
          description: 'Discovery-source description.',
          type: 'announcement',
          jurisdiction: 'federal',
          sourceUrl: DISCOVERY_URL,
        },
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        officialSourceUrl: SOURCE_URL,
        proposedRecord: {
          id: 'new-timeline-event',
          date: '2026-07-01',
          datePrecision: 'day',
          title: 'New event',
          description: 'Official source-backed timeline event.',
          type: 'announcement',
          jurisdiction: 'federal',
          sourceUrl: SOURCE_URL,
        },
      }),
    ).rejects.toThrow('already used by tracked or staged content');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('requires an explicit replacement draft for a stage-only approval', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({
        sourceUrl: DISCOVERY_URL,
        sourceEvidence: {
          url: DISCOVERY_URL,
          retrievedAt: '2026-07-15T00:00:00.000Z',
        },
        proposedRecord: buildDraft({ sourceUrl: DISCOVERY_URL }),
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        officialSourceUrl: SOURCE_URL,
      }),
    ).rejects.toThrow('explicitly reviewed replacement proposedRecord');
    expect(retrieveSource).not.toHaveBeenCalled();
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('derives timeline date precision from matching source evidence', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({
        entryKind: 'timeline_event',
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-16T00:00:00.000Z',
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'month',
        },
        proposedRecord: {
          id: 'timeline-ai-policy',
          date: '2026-07-01',
          title: 'AI policy announced',
          description: 'An official AI policy announcement.',
          type: 'announcement',
          jurisdiction: 'federal',
          sourceUrl: SOURCE_URL,
        },
      }),
    );
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
      publishedAt: '2026-07-01',
      publishedAtPrecision: 'month',
    });

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
    });

    expect(approved.proposedRecord).toMatchObject({
      date: '2026-07-01',
      datePrecision: 'month',
    });
  });

  it('rejects timeline approval when source date precision is unknown', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({
        entryKind: 'timeline_event',
        proposedRecord: {
          id: 'timeline-ai-policy',
          date: '2026-07-01',
          title: 'AI policy announced',
          description: 'An official AI policy announcement.',
          type: 'announcement',
          jurisdiction: 'federal',
          sourceUrl: SOURCE_URL,
        },
      }),
    );
    extractRetrievedDocument.mockResolvedValueOnce({
      title: 'Official AI policy',
      text: 'Official source-backed policy text.',
      publishedAt: '2026-07-01',
    });

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('date precision is required');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('approves a changed-document review as an update to its target policy', async () => {
    const target: Policy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [
        {
          type: 'published',
          date: '2026-07-01',
          precision: 'day',
          primary: true,
          source: {
            url: SOURCE_URL,
            contentHash: 'b'.repeat(64),
            publishedAt: '2026-07-01',
            publishedAtPrecision: 'day',
          },
        },
      ],
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getPolicies.mockResolvedValue([target]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        proposedRecord: buildDraft({
          id: target.id,
          effectiveDate: '2026-07-01',
        }),
      }),
    );

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
    });

    expect(approved).toMatchObject({
      status: 'approved',
      targetPolicyRevisionHash: policyRevisionHash(target),
      proposedRecord: {
        id: target.id,
        sourceUrl: SOURCE_URL,
      },
    });
  });

  it('rejects a stale submitted draft when a target policy changed after staging', async () => {
    const stagedTarget: Policy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [{
        type: 'published',
        date: '2026-07-01',
        precision: 'day',
        primary: true,
      }],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const editedTarget: Policy = {
      ...stagedTarget,
      title: 'Editorially corrected policy title',
      updatedAt: '2026-07-15T00:00:00.000Z',
    };
    getPolicies.mockResolvedValue([editedTarget]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: stagedTarget.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(stagedTarget),
        proposedRecord: stagedTarget,
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: stagedTarget,
      }),
    ).rejects.toThrow('expectedTargetRevisionHash');

    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('records the current target revision after an explicit update rebase', async () => {
    const stagedTarget = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [
        {
          type: 'published' as const,
          date: '2026-07-01',
          precision: 'day' as const,
          primary: true,
        },
      ],
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    } satisfies Policy;
    const editedTarget: Policy = {
      ...stagedTarget,
      title: 'Editorially corrected policy title',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    getPolicies.mockResolvedValue([editedTarget]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: stagedTarget.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(stagedTarget),
        proposedRecord: stagedTarget,
      }),
    );

    const approved = await approveStagedSource({
      id: 'source-review-1',
      actor: 'reviewer',
      expectedTargetRevisionHash: policyRevisionHash(editedTarget),
      proposedRecord: buildDraft({
        id: editedTarget.id,
        title: editedTarget.title,
        effectiveDate: '2026-07-01',
      }),
    });

    expect(approved).toMatchObject({
      status: 'approved',
      targetPolicyBaseRevisionHash: policyRevisionHash(editedTarget),
      targetPolicyRevisionHash: policyRevisionHash(editedTarget),
    });
  });

  it('refuses approval when discovery or retrieval timestamps are in the future', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({
        discoveredAt: '2999-07-16T00:00:00.000Z',
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2999-07-16T00:00:00.000Z',
          contentHash: 'a'.repeat(64),
        },
      }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('before it was discovered');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('rejects malformed editor JSON before approving a canonical record', async () => {
    const malformed = buildDraft({
      effectiveDate: '2026-07-01',
      tags: [null] as unknown as string[],
    });
    getSourceReviewById.mockResolvedValue(
      buildReview({ proposedRecord: malformed }),
    );

    await expect(
      approveStagedSource({
        id: 'source-review-1',
        actor: 'reviewer',
        proposedRecord: malformed,
      }),
    ).rejects.toThrow('tags must contain non-empty strings');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('refuses to publish a pending review', async () => {
    getSourceReviewById.mockResolvedValue(buildReview());

    await expect(publishStagedSource('source-review-1')).rejects.toThrow(
      'explicitly approved',
    );
    expect(createPolicy).not.toHaveBeenCalled();
  });

  it('requires re-approval when editorial verification expired before publication', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2025-01-01T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2025-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        reviewedAt: '2025-01-01T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: approvedPolicy,
      }),
    );
    getPolicies.mockResolvedValue([approvedPolicy]);

    await expect(
      publishStagedSource('source-review-1'),
    ).rejects.toThrow('verification has expired');
    expect(createPolicy).not.toHaveBeenCalled();
    expect(updatePolicy).not.toHaveBeenCalled();
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('requires re-approval when the official source changes after approval', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: approvedPolicy,
      }),
    );
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Changed official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      publishStagedSource('source-review-1'),
    ).rejects.toThrow('changed after approval');
    expect(createPolicy).not.toHaveBeenCalled();
    expect(updatePolicy).not.toHaveBeenCalled();
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('requires re-approval when the redirect destination changes after approval', async () => {
    const approvedDestination = 'https://example.gov.au/current-policy';
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          finalUrl: approvedDestination,
          contentHash: 'a'.repeat(64),
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        sourceEvidence: approvedPolicy.verification.source,
        proposedRecord: approvedPolicy,
      }),
    );
    retrieveSource.mockResolvedValueOnce({
      body: '<main>Same normalized AI policy content</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: 'https://example.gov.au/replacement-policy',
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'text/html',
        contentHash: 'a'.repeat(64),
      },
    });

    await expect(
      publishStagedSource('source-review-1'),
    ).rejects.toThrow('redirect destination changed after approval');
    expect(createPolicy).not.toHaveBeenCalled();
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('blocks publication when an update redirect identity belongs to another policy', async () => {
    const otherUrl = 'https://example.gov.au/other-policy';
    const targetDraft = buildDraft({
      id: 'existing-policy',
      effectiveDate: '2026-07-01',
    });
    const target: Policy = {
      ...targetDraft,
      effectiveDate: '2026-07-01',
      dates: targetDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const otherDraft = buildDraft({
      id: 'other-policy',
      sourceUrl: otherUrl,
      effectiveDate: '2026-07-01',
    });
    const other: Policy = {
      ...otherDraft,
      effectiveDate: '2026-07-01',
      dates: otherDraft.dates ?? [],
      verification: {
        status: 'verified',
        source: { url: otherUrl, contentHash: 'b'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    const approvedPolicy: Policy = {
      ...target,
      updatedAt: '2026-07-16T00:00:00.000Z',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified',
        source: {
          url: SOURCE_URL,
          finalUrl: otherUrl,
          contentHash: 'b'.repeat(64),
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    };
    getPolicies.mockResolvedValue([target, other]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        targetPolicyId: target.id,
        targetPolicyBaseRevisionHash: policyRevisionHash(target),
        targetPolicyRevisionHash: policyRevisionHash(target),
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        sourceEvidence: approvedPolicy.verification.source,
        proposedRecord: approvedPolicy,
      }),
    );

    await expect(publishStagedSource('source-review-1')).rejects.toThrow(
      'identity is now owned by another tracked or staged record',
    );
    expect(retrieveSource).not.toHaveBeenCalled();
    expect(updatePolicy).not.toHaveBeenCalled();
  });

  it('publishes a validated approved record and updates editorial freshness', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: approvedPolicy,
      }),
    );

    await publishStagedSource('source-review-1');

    expect(createPolicy).toHaveBeenCalledWith(approvedPolicy);
    expect(markCollectionReviewed).toHaveBeenCalledWith(
      '2026-07-16T00:00:00.000Z',
    );
    expect(updateSourceReview.mock.invocationCallOrder[0]).toBeLessThan(
      markCollectionReviewed.mock.invocationCallOrder[0],
    );
  });

  it('serializes concurrent publications across the complete transaction', async () => {
    const firstUrl = 'https://one.example.gov.au/policy';
    const secondUrl = 'https://two.example.gov.au/policy';
    const makePolicy = (
      id: string,
      sourceUrl: string,
      contentHash: string,
    ): Policy => {
      const draft = buildDraft({
        id,
        sourceUrl,
        effectiveDate: '2026-07-01',
      });
      return {
        ...draft,
        effectiveDate: '2026-07-01',
        dates: draft.dates ?? [],
        lastReviewedAt: '2026-07-16T00:00:00.000Z',
        verification: {
          status: 'verified',
          source: { url: sourceUrl, contentHash },
          checkedAt: '2026-07-16T00:00:00.000Z',
          checkedBy: 'reviewer',
          method: 'manual',
        },
      };
    };
    const firstPolicy = makePolicy('first-policy', firstUrl, 'a'.repeat(64));
    const secondPolicy = makePolicy(
      'second-policy',
      secondUrl,
      'b'.repeat(64),
    );
    const reviews = new Map([
      [
        'first-review',
        buildReview({
          id: 'first-review',
          sourceUrl: firstUrl,
          status: 'approved',
          reviewedAt: '2026-07-16T00:00:00.000Z',
          reviewedBy: 'reviewer',
          sourceEvidence: {
            url: firstUrl,
            retrievedAt: '2026-07-16T00:00:00.000Z',
            contentHash: 'a'.repeat(64),
          },
          proposedRecord: firstPolicy,
        }),
      ],
      [
        'second-review',
        buildReview({
          id: 'second-review',
          sourceUrl: secondUrl,
          status: 'approved',
          reviewedAt: '2026-07-16T00:00:00.000Z',
          reviewedBy: 'reviewer',
          sourceEvidence: {
            url: secondUrl,
            retrievedAt: '2026-07-16T00:00:00.000Z',
            contentHash: 'b'.repeat(64),
          },
          proposedRecord: secondPolicy,
        }),
      ],
    ]);
    const canonicalPolicies: Policy[] = [];
    getSourceReviewById.mockImplementation(async (id: string) =>
      reviews.get(id),
    );
    getPolicies.mockImplementation(async () => [...canonicalPolicies]);
    createPolicy.mockImplementation(async (policy: Policy) => {
      canonicalPolicies.push(policy);
      return policy;
    });
    let activeRetrievals = 0;
    let maximumActiveRetrievals = 0;
    retrieveSource.mockImplementation(async (url: string) => {
      activeRetrievals++;
      maximumActiveRetrievals = Math.max(
        maximumActiveRetrievals,
        activeRetrievals,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRetrievals--;
      const contentHash = url === firstUrl ? 'a'.repeat(64) : 'b'.repeat(64);
      return {
        body: '<main>Official AI policy</main>',
        durationMs: 20,
        evidence: {
          url,
          finalUrl: url,
          retrievedAt: '2026-07-16T00:01:00.000Z',
          contentType: 'text/html',
          contentHash,
        },
      };
    });

    await Promise.all([
      publishStagedSource('first-review'),
      publishStagedSource('second-review'),
    ]);

    expect(maximumActiveRetrievals).toBe(1);
    expect(canonicalPolicies.map((policy) => policy.id).sort()).toEqual([
      'first-policy',
      'second-policy',
    ]);
  });

  it('promotes the matching development when a collector review is published', async () => {
    const approvedPolicy = {
      ...buildDraft({
        title: 'Editorially corrected AI policy',
        description: 'Editorially verified description.',
        jurisdiction: 'nsw',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        id: 'source-review-dev-policy-update',
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: approvedPolicy,
      }),
    );

    await publishStagedSource('source-review-dev-policy-update');

    expect(updateDevelopment).toHaveBeenCalledWith(
      'dev-policy-update',
      expect.objectContaining({
        status: 'promoted',
        relatedPolicyId: approvedPolicy.id,
        verification: approvedPolicy.verification,
        title: approvedPolicy.title,
        url: approvedPolicy.sourceUrl,
        summary: approvedPolicy.description,
        jurisdiction: approvedPolicy.jurisdiction,
        publishedAt: '2026-07-01',
        publishedAtPrecision: 'day',
        relevanceScore: 1,
        classification: 'curated',
        assessment: {
          method: 'editorial',
          assessedAt: '2026-07-16T00:00:00.000Z',
          promptVersion: 'editorial-review-v1',
        },
      }),
    );
  });

  it('preserves later development edits when retrying an already-published review', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const publishedReview = buildReview({
      id: 'source-review-dev-policy-update',
      status: 'published',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      publishedAt: '2026-07-16T00:01:00.000Z',
      proposedRecord: approvedPolicy,
    });
    getSourceReviewById.mockResolvedValue(publishedReview);
    getDevelopments.mockResolvedValue([
      {
        id: 'dev-policy-update',
        title: 'Later editorial correction',
        status: 'dismissed',
        dismissalReason: 'Later editorial decision',
      },
    ]);

    await expect(
      publishStagedSource(publishedReview.id),
    ).resolves.toEqual(publishedReview);

    expect(createPolicy).not.toHaveBeenCalled();
    expect(updateDevelopment).not.toHaveBeenCalled();
    expect(upsertDevelopment).not.toHaveBeenCalled();
    expect(markCollectionReviewed).toHaveBeenCalledWith(
      publishedReview.reviewedAt,
    );
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('repairs an unpromoted development when retrying a published review', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const linkedDevelopment = buildLinkedDevelopment();
    const publishedReview = buildReview({
      id: 'source-review-dev-policy-update',
      status: 'published',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      publishedAt: '2026-07-16T00:01:00.000Z',
      proposedRecord: approvedPolicy,
      linkedDevelopment,
    });
    getSourceReviewById.mockResolvedValue(publishedReview);
    getDevelopments.mockResolvedValue([
      {
        ...linkedDevelopment,
        title: 'Canonical detected title before approval',
        verification: {
          ...linkedDevelopment.verification,
          source: {
            ...linkedDevelopment.verification.source,
            retrievedAt: '2026-07-15T12:00:00.000Z',
          },
        },
      },
    ]);

    await publishStagedSource(publishedReview.id);

    expect(updateDevelopment).toHaveBeenCalledWith(
      linkedDevelopment.id,
      expect.objectContaining({
        status: 'promoted',
        classification: 'curated',
        verification: approvedPolicy.verification,
        relatedPolicyId: approvedPolicy.id,
      }),
    );
    expect(upsertDevelopment).not.toHaveBeenCalled();
  });

  it('persists the canonical timeline relationship when promoting a development', async () => {
    const event = {
      id: 'timeline-promoted-development',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'AI policy timeline event',
      description: 'Editorially verified timeline development.',
      type: 'announcement' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const linkedDevelopment = buildLinkedDevelopment();
    const publishedReview = buildReview({
      id: 'source-review-dev-policy-update',
      entryKind: 'timeline_event',
      status: 'published',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      publishedAt: '2026-07-16T00:01:00.000Z',
      proposedRecord: event,
      linkedDevelopment,
    });
    getSourceReviewById.mockResolvedValue(publishedReview);
    getDevelopments.mockResolvedValue([linkedDevelopment]);

    await publishStagedSource(publishedReview.id);

    expect(updateDevelopment).toHaveBeenCalledWith(
      linkedDevelopment.id,
      expect.objectContaining({
        status: 'promoted',
        relatedTimelineEventId: event.id,
        verification: event.verification,
      }),
    );
  });

  it('reconstructs a missing development from the staged review snapshot', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const linkedDevelopment = {
      id: 'dev-policy-update',
      title: approvedPolicy.title,
      url: SOURCE_URL,
      sourceId: 'test-source',
      sourceName: 'Test source',
      jurisdiction: 'federal' as const,
      detectedAt: '2026-07-16T00:00:00.000Z',
      summary: approvedPolicy.description,
      relevanceScore: 1,
      classification: 'heuristic' as const,
      assessment: {
        method: 'heuristic' as const,
        assessedAt: '2026-07-16T00:00:00.000Z',
        promptVersion: 'test',
      },
      verification: {
        status: 'needs_review' as const,
        source: { url: SOURCE_URL },
      },
      status: 'detected' as const,
    };
    getSourceReviewById.mockResolvedValue(
      buildReview({
        id: 'source-review-dev-policy-update',
        status: 'published',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        publishedAt: '2026-07-16T00:01:00.000Z',
        proposedRecord: approvedPolicy,
        linkedDevelopment,
      }),
    );
    await publishStagedSource('source-review-dev-policy-update');

    expect(upsertDevelopment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: linkedDevelopment.id,
        status: 'promoted',
        relatedPolicyId: approvedPolicy.id,
        verification: approvedPolicy.verification,
      }),
    );
  });

  it('finishes an approved publication retry when the canonical policy was already written', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getPolicies.mockResolvedValue([approvedPolicy]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: approvedPolicy,
      }),
    );

    await publishStagedSource('source-review-1');

    expect(createPolicy).not.toHaveBeenCalled();
    expect(sourceUrlExists).not.toHaveBeenCalled();
    expect(retrieveSource).toHaveBeenCalledWith(SOURCE_URL);
    expect(markCollectionReviewed).toHaveBeenCalled();
    expect(updateSourceReview).toHaveBeenCalledWith(
      'source-review-1',
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('keeps an already-written policy withheld when its source changed before retry', async () => {
    const approvedPolicy = {
      ...buildDraft({ effectiveDate: '2026-07-01' }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getPolicies.mockResolvedValue([approvedPolicy]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: approvedPolicy,
      }),
    );
    retrieveSource.mockResolvedValue({
      body: '<main>Newer official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      publishStagedSource('source-review-1'),
    ).rejects.toThrow('changed after approval');

    expect(createPolicy).not.toHaveBeenCalled();
    expect(markCollectionReviewed).not.toHaveBeenCalled();
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('recovers an already-written timeline event after rechecking its source', async () => {
    const event = {
      id: 'timeline-ai-policy',
      date: '2026-07-01',
      datePrecision: 'day' as const,
      title: 'AI policy issued',
      description: 'The official AI policy was issued.',
      type: 'policy_introduced' as const,
      jurisdiction: 'federal' as const,
      sourceUrl: SOURCE_URL,
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'a'.repeat(64),
          publishedAt: '2026-07-01',
          publishedAtPrecision: 'day' as const,
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    getTimelineEvents.mockResolvedValue([event]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        entryKind: 'timeline_event',
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        proposedRecord: event,
      }),
    );

    await publishStagedSource('source-review-1');

    expect(retrieveSource).toHaveBeenCalledWith(SOURCE_URL);
    expect(createTimelineEvent).not.toHaveBeenCalled();
    expect(updateSourceReview).toHaveBeenCalledWith(
      'source-review-1',
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('publishes an approved changed-document review by updating the target policy', async () => {
    const approvedPolicy: Policy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [
        {
          type: 'published',
          date: '2026-07-01',
          precision: 'day',
          primary: true,
          source: {
            url: SOURCE_URL,
            contentHash: 'b'.repeat(64),
            publishedAt: '2026-07-01',
            publishedAtPrecision: 'day',
          },
        },
      ],
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: {
          url: SOURCE_URL,
          contentHash: 'b'.repeat(64),
        },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const existingPolicy = {
      ...approvedPolicy,
      verification: {
        ...approvedPolicy.verification,
        checkedAt: '2026-07-01T00:00:00.000Z',
        lastSourceAuditAt: '2026-07-15T00:00:00.000Z',
        source: {
          ...approvedPolicy.verification.source,
          contentHash: 'a'.repeat(64),
        },
      },
    };
    getPolicies.mockResolvedValue([existingPolicy]);
    sourceUrlExists.mockResolvedValue(true);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: approvedPolicy.id,
        targetPolicyRevisionHash: policyRevisionHash(existingPolicy),
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-16T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
        proposedRecord: approvedPolicy,
      }),
    );
    retrieveSource.mockResolvedValue({
      body: '<main>Changed official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await publishStagedSource('source-review-1');

    expect(sourceUrlExists).not.toHaveBeenCalled();
    expect(createPolicy).not.toHaveBeenCalled();
    expect(updatePolicy).toHaveBeenCalledWith(
      approvedPolicy.id,
      expect.objectContaining({
        ...approvedPolicy,
        verification: expect.objectContaining({
          ...approvedPolicy.verification,
          lastSourceAuditAt: '2026-07-15T00:00:00.000Z',
        }),
      }),
    );
  });

  it('refuses to overwrite a target policy edited after update approval', async () => {
    const baselinePolicy: Policy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [
        {
          type: 'published',
          date: '2026-07-01',
          precision: 'day',
          primary: true,
          source: {
            url: SOURCE_URL,
            contentHash: 'a'.repeat(64),
            publishedAt: '2026-07-01',
            publishedAtPrecision: 'day',
          },
        },
      ],
      lastReviewedAt: '2026-07-01T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const approvedPolicy = {
      ...baselinePolicy,
      description: 'Approved description for the changed source.',
      updatedAt: '2026-07-16T00:00:00.000Z',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        ...baselinePolicy.verification,
        source: { url: SOURCE_URL, contentHash: 'b'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
      },
    };
    const concurrentlyEditedPolicy = {
      ...baselinePolicy,
      description: 'A separate editorial correction.',
      updatedAt: '2026-07-16T00:30:00.000Z',
    };
    getPolicies.mockResolvedValue([concurrentlyEditedPolicy]);
    getSourceReviewById.mockResolvedValue(
      buildReview({
        targetPolicyId: approvedPolicy.id,
        targetPolicyRevisionHash: policyRevisionHash(baselinePolicy),
        status: 'approved',
        reviewedAt: '2026-07-16T00:00:00.000Z',
        reviewedBy: 'reviewer',
        sourceEvidence: {
          url: SOURCE_URL,
          retrievedAt: '2026-07-16T00:00:00.000Z',
          contentHash: 'b'.repeat(64),
        },
        proposedRecord: approvedPolicy,
      }),
    );
    retrieveSource.mockResolvedValue({
      body: '<main>Changed official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      publishStagedSource('source-review-1'),
    ).rejects.toThrow('changed after approval');
    expect(updatePolicy).not.toHaveBeenCalled();
  });

  it('retries publication after the approved policy was written but side effects failed', async () => {
    const baselinePolicy: Policy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      dates: [
        {
          type: 'published',
          date: '2026-07-01',
          precision: 'day',
          primary: true,
          source: {
            url: SOURCE_URL,
            contentHash: 'a'.repeat(64),
            publishedAt: '2026-07-01',
            publishedAtPrecision: 'day',
          },
        },
      ],
      lastReviewedAt: '2026-07-01T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const approvedPolicy = {
      ...baselinePolicy,
      description: 'Approved description for the changed source.',
      updatedAt: '2026-07-16T00:00:00.000Z',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        ...baselinePolicy.verification,
        source: { url: SOURCE_URL, contentHash: 'b'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
      },
    };
    const review = buildReview({
      targetPolicyId: approvedPolicy.id,
      targetPolicyRevisionHash: policyRevisionHash(baselinePolicy),
      status: 'approved',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      reviewedBy: 'reviewer',
      sourceEvidence: {
        url: SOURCE_URL,
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentHash: 'b'.repeat(64),
      },
      proposedRecord: approvedPolicy,
    });
    getSourceReviewById.mockResolvedValue(review);
    getPolicies
      .mockResolvedValueOnce([baselinePolicy])
      .mockResolvedValueOnce([baselinePolicy])
      .mockResolvedValueOnce([baselinePolicy])
      .mockResolvedValueOnce([approvedPolicy])
      .mockResolvedValueOnce([approvedPolicy])
      .mockResolvedValueOnce([approvedPolicy]);
    markCollectionReviewed
      .mockRejectedValueOnce(new Error('metadata write failed'))
      .mockResolvedValueOnce(undefined);
    retrieveSource.mockResolvedValue({
      body: '<main>Changed official AI policy</main>',
      durationMs: 1,
      evidence: {
        url: SOURCE_URL,
        finalUrl: SOURCE_URL,
        retrievedAt: '2026-07-16T00:01:00.000Z',
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
      },
    });

    await expect(
      publishStagedSource(review.id),
    ).rejects.toThrow('metadata write failed');
    await expect(publishStagedSource(review.id)).resolves.toMatchObject({
      status: 'published',
    });

    expect(updatePolicy).toHaveBeenCalledTimes(1);
    expect(updateSourceReview).toHaveBeenCalledWith(
      review.id,
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('orders update reviews by immutable source sequence after an older version is re-approved', async () => {
    const approvedPolicy = {
      ...buildDraft({
        id: 'existing-policy',
        effectiveDate: '2026-07-01',
      }),
      effectiveDate: '2026-07-01',
      lastReviewedAt: '2026-07-16T00:00:00.000Z',
      verification: {
        status: 'verified' as const,
        source: { url: SOURCE_URL, contentHash: 'a'.repeat(64) },
        checkedAt: '2026-07-16T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual' as const,
      },
    };
    const olderReview = buildReview({
      targetPolicyId: approvedPolicy.id,
      sourceVersionSequence: 1,
      status: 'approved',
      discoveredAt: '2026-07-16T01:00:00.000Z',
      reviewedAt: '2026-07-16T01:30:00.000Z',
      reviewedBy: 'reviewer',
      sourceEvidence: {
        url: SOURCE_URL,
        retrievedAt: '2026-07-16T04:00:00.000Z',
        contentHash: 'a'.repeat(64),
      },
      proposedRecord: approvedPolicy,
    });
    const newerReview = buildReview({
      id: 'source-review-newer',
      targetPolicyId: approvedPolicy.id,
      sourceVersionSequence: 2,
      discoveredAt: '2026-07-16T02:00:00.000Z',
      sourceEvidence: {
        url: SOURCE_URL,
        retrievedAt: '2026-07-16T02:00:00.000Z',
        contentHash: 'b'.repeat(64),
      },
    });
    getSourceReviewById.mockResolvedValue(olderReview);
    getSourceReviews.mockResolvedValue([olderReview, newerReview]);

    await expect(
      publishStagedSource(olderReview.id),
    ).rejects.toThrow('newer source update review exists');

    newerReview.sourceVersionSequence = 1;
    await expect(
      publishStagedSource(olderReview.id),
    ).rejects.toThrow('newer source update review exists');
    expect(updatePolicy).not.toHaveBeenCalled();
  });

  it('keeps changed-source reviews pending until they are re-verified', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({ targetPolicyId: 'existing-policy' }),
    );

    await expect(
      rejectStagedSource('source-review-1', 'No material change'),
    ).rejects.toThrow('cannot be rejected');
    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('dismisses the matching development when a new-source review is rejected', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({ id: 'source-review-dev-rejected-lead' }),
    );

    await rejectStagedSource(
      'source-review-dev-rejected-lead',
      'Duplicate lead',
    );

    expect(updateDevelopment).toHaveBeenCalledWith(
      'dev-rejected-lead',
      {
        status: 'dismissed',
        dismissalReason: 'Duplicate lead',
      },
    );
  });

  it('dismisses a lead before making its rejection terminal', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({ id: 'source-review-dev-rejection-boundary' }),
    );
    updateSourceReview.mockRejectedValueOnce(
      new Error('terminal rejection write failed'),
    );

    await expect(
      rejectStagedSource(
        'source-review-dev-rejection-boundary',
        'Duplicate lead',
      ),
    ).rejects.toThrow('terminal rejection write failed');

    expect(updateDevelopment).toHaveBeenCalledWith(
      'dev-rejection-boundary',
      {
        status: 'dismissed',
        dismissalReason: 'Duplicate lead',
      },
    );
    expect(updateDevelopment.mock.invocationCallOrder[0]).toBeLessThan(
      updateSourceReview.mock.invocationCallOrder[0],
    );
  });

  it('keeps a review retryable when development dismissal fails', async () => {
    getSourceReviewById.mockResolvedValue(
      buildReview({ id: 'source-review-dev-dismissal-failure' }),
    );
    updateDevelopment.mockRejectedValueOnce(
      new Error('development dismissal failed'),
    );

    await expect(
      rejectStagedSource(
        'source-review-dev-dismissal-failure',
        'Duplicate lead',
      ),
    ).rejects.toThrow('development dismissal failed');

    expect(updateSourceReview).not.toHaveBeenCalled();
  });

  it('repairs development dismissal when retrying a rejected review', async () => {
    const rejected = buildReview({
      id: 'source-review-dev-rejected-retry',
      status: 'rejected',
      rejectionReason: 'Duplicate lead',
    });
    getSourceReviewById.mockResolvedValue(rejected);

    await rejectStagedSource(rejected.id);

    expect(updateSourceReview).not.toHaveBeenCalled();
    expect(updateDevelopment).toHaveBeenCalledWith(
      'dev-rejected-retry',
      {
        status: 'dismissed',
        dismissalReason: 'Duplicate lead',
      },
    );
  });

  it('records an explicit check for a manual-only catalogue source', async () => {
    const review = await recordManualSourceReview({
      sourceId: 'dta-media',
      status: 'checked',
      actor: 'reviewer',
      notes: 'Checked in a browser.',
    });

    expect(review).toMatchObject({
      sourceId: 'dta-media',
      status: 'checked',
      reviewedBy: 'reviewer',
      evidence: {
        url: 'https://www.dta.gov.au/news-and-blogs/latest/feed/news_item',
      },
      notes: 'Checked in a browser.',
    });
    expect(upsertManualSourceReview).toHaveBeenCalledWith(review);
  });

  it('requires an explanation when a manual source is unavailable', async () => {
    await expect(
      recordManualSourceReview({
        sourceId: 'dta-media',
        status: 'source_unavailable',
        actor: 'reviewer',
      }),
    ).rejects.toThrow('require substantive inspection notes');
    expect(upsertManualSourceReview).not.toHaveBeenCalled();
  });

  it('requires substantive notes for a successful manual source check', async () => {
    await expect(
      recordManualSourceReview({
        sourceId: 'dta-media',
        status: 'checked',
        actor: 'reviewer',
        notes: 'Checked.',
      }),
    ).rejects.toThrow('require substantive inspection notes');
    expect(upsertManualSourceReview).not.toHaveBeenCalled();
  });

  it('rejects materially future-dated manual source reviews', async () => {
    await expect(
      recordManualSourceReview({
        sourceId: 'dta-media',
        status: 'checked',
        actor: 'reviewer',
        notes: 'Inspected the complete source listing in a browser.',
        reviewedAt: '2999-07-16T00:00:00.000Z',
      }),
    ).rejects.toThrow('cannot be future-dated');
    expect(upsertManualSourceReview).not.toHaveBeenCalled();
  });
});
