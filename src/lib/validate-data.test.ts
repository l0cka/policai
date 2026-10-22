/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { buildAgency, buildManualDecision, buildPolicy, buildTimelineEvent } from '@/test/factories';
import {
  countUnsubstantiatedSecondaryDates,
  isAllowedSourceHost,
  validateCollectionMeta,
  validateDevelopments,
  validatePolicyFrameworkArtifact,
  validatePolicies,
  validateSourceMonitoring,
  validateSourceReviews,
  validateTimeline,
  validateBodies,
  validateWatchSources,
  validateWatchState,
} from './validate-data';
import { emptyWatchState, type WatchState } from '@/lib/pipeline/collect';
import { ROBOTS_RULES_CAP, ROBOTS_SITEMAPS_CAP, type HostRecord } from '@/lib/pipeline/host-gate';
import type { WatchSource } from '@/lib/pipeline/sources';
import type { CollectionMeta, Policy, SourceRunResult } from '@/types';

describe('isAllowedSourceHost', () => {
  it('allows https gov.au hosts and the CSIRO exception', () => {
    expect(isAllowedSourceHost('https://www.industry.gov.au/x')).toBe(true);
    expect(isAllowedSourceHost('https://supremecourt.nsw.gov.au/x')).toBe(true);
    expect(isAllowedSourceHost('https://www.csiro.au/en/news')).toBe(true);
  });

  it('rejects http, non-government, and malformed URLs', () => {
    expect(isAllowedSourceHost('http://www.industry.gov.au/x')).toBe(false);
    expect(isAllowedSourceHost('https://example.com/x')).toBe(false);
    expect(isAllowedSourceHost('not a url')).toBe(false);
  });
});

describe('validatePolicies', () => {
  it('accepts a well-formed policy', () => {
    const report = validatePolicies([buildPolicy()]);
    expect(report.errors).toEqual([]);
  });

  it('rejects a record without updatedAt, trashed or not, since it dates register charts', () => {
    const active: Partial<Policy> = buildPolicy({ id: 'no-updated-at' });
    delete active.updatedAt;
    const trashed = { ...active, id: 'trashed-no-updated-at', status: 'trashed' };
    const report = validatePolicies([active, trashed] as Policy[]);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'no-updated-at: invalid updatedAt "undefined"',
        'trashed-no-updated-at: invalid updatedAt "undefined"',
      ]),
    );
  });

  it('rejects a verified primary date without matching source evidence', () => {
    const policy = buildPolicy();
    delete policy.dates[0].source?.reviewedDate;

    const report = validatePolicies([policy]);

    expect(report.errors).toContain(
      `${policy.id}: verified primary date requires matching source publication metadata or reviewed date evidence`,
    );
  });

  it('rejects verified records without a reproducible source fingerprint', () => {
    const policy = buildPolicy();
    delete policy.verification.source.contentHash;

    const report = validatePolicies([policy]);

    expect(report.errors).toContain(
      `${policy.id}: verified records require a SHA-256 source fingerprint`,
    );
  });

  it('rejects impossible calendar dates instead of allowing date rollover', () => {
    const policy = buildPolicy({
      effectiveDate: '2026-02-31',
      dates: [
        {
          type: 'effective',
          date: '2026-02-31',
          precision: 'day',
          primary: true,
        },
      ],
    });

    const report = validatePolicies([policy]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid effectiveDate'),
        `${policy.id}:dates[0]: invalid date`,
      ]),
    );
  });

  it('separates exact calendar dates from timezone-qualified timestamps', () => {
    const timestampDate = buildPolicy({
      effectiveDate: '2026-07-01T00:00:00.000Z',
      dates: [
        {
          type: 'effective',
          date: '2026-07-01T00:00:00.000Z',
          precision: 'day',
          primary: true,
        },
      ],
    });
    const localTimestamp = buildPolicy({
      verification: {
        ...buildPolicy().verification,
        checkedAt: '2026-07-01T12:00:00',
      },
    });

    const report = validatePolicies([timestampDate, localTimestamp]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid effectiveDate'),
        `${timestampDate.id}:dates[0]: invalid date`,
        `${localTimestamp.id}: verified records require checkedAt`,
      ]),
    );
  });

  it('accepts deadline date types as secondary dates at any precision', () => {
    const policy = buildPolicy();
    policy.dates = [
      ...policy.dates,
      { type: 'consultation_closed', date: '2026-11-14', precision: 'day' },
      { type: 'compliance_due', date: '2027-07-01', precision: 'month' },
      { type: 'scheduled_review', date: '2028-01-01', precision: 'year' },
    ];

    expect(validatePolicies([policy]).errors).toEqual([]);
  });

  it('rejects an unknown date type', () => {
    const policy = buildPolicy();
    policy.dates = [
      ...policy.dates,
      { type: 'submissions_due', date: '2026-11-14', precision: 'day' },
    ] as unknown as Policy['dates'];

    expect(validatePolicies([policy]).errors).toContain(
      `${policy.id}:dates[1]: invalid date type`,
    );
  });

  it('requires precision on deadline dates and keeps month/year anchors honest', () => {
    const policy = buildPolicy();
    policy.dates = [
      ...policy.dates,
      { type: 'compliance_due', date: '2027-07-15', precision: 'month' },
      { type: 'scheduled_review', date: '2028-03-01', precision: 'year' },
      { type: 'consultation_closed', date: '2026-11-14' },
    ] as unknown as Policy['dates'];

    expect(validatePolicies([policy]).errors).toEqual(
      expect.arrayContaining([
        `${policy.id}:dates[1]: month precision must use the first day`,
        `${policy.id}:dates[2]: year precision must use 1 January`,
        `${policy.id}:dates[3]: invalid precision`,
      ]),
    );
  });

  it('rejects a deadline as the primary date', () => {
    const base = buildPolicy();
    const policy = buildPolicy({
      dates: [
        { ...base.dates[0], type: 'compliance_due' },
      ],
    });

    expect(validatePolicies([policy]).errors).toContain(
      `${policy.id}:dates[0]: a deadline date cannot be the primary date`,
    );
  });

  it('rejects non-string policy list values and malformed date entries', () => {
    const policy = buildPolicy();
    policy.tags = [null] as unknown as string[];
    policy.agencies = [42] as unknown as string[];
    policy.dates = [null] as unknown as Policy['dates'];

    const report = validatePolicies([policy]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        `${policy.id}: tags must contain non-empty strings`,
        `${policy.id}: agencies must contain non-empty strings`,
        `${policy.id}:dates[0]: structured date must be an object`,
      ]),
    );
  });

  it('accepts linked document evidence behind a composite source fingerprint', () => {
    const sourceUrl =
      'https://example.gov.au/policies/national-ai-ethics-framework';
    const report = validatePolicies([
      buildPolicy({
        sourceUrl,
        verification: {
          status: 'verified',
          source: {
            url: sourceUrl,
            contentHash: 'a'.repeat(64),
            linkedDocuments: [
              {
                url: 'https://assets.example.gov.au/policy.pdf',
                contentType: 'application/pdf',
                contentHash: 'b'.repeat(64),
              },
            ],
          },
          checkedAt: '2026-07-16T00:00:00.000Z',
          checkedBy: 'reviewer',
          method: 'manual',
        },
      }),
    ]);

    expect(report.errors).toEqual([]);
  });

  it('rejects automated verification as a public editorial verification', () => {
    const policy = buildPolicy();
    const report = validatePolicies([
      {
        ...policy,
        verification: {
          ...policy.verification,
          method: 'automated',
        },
      },
    ]);

    expect(report.errors).toContain(
      `${policy.id}: verified records require manual editorial verification`,
    );
  });

  it('rejects malformed linked document evidence', () => {
    const sourceUrl =
      'https://example.gov.au/policies/national-ai-ethics-framework';
    const report = validatePolicies([
      buildPolicy({
        sourceUrl,
        verification: {
          status: 'verified',
          source: {
            url: sourceUrl,
            linkedDocuments: [
              {
                url: 'http://assets.example.gov.au/policy.pdf',
                contentHash: 'not-a-hash',
              },
            ],
          },
          checkedAt: '2026-07-16T00:00:00.000Z',
          checkedBy: 'reviewer',
          method: 'manual',
        },
      }),
    ]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('composite verification contentHash'),
        expect.stringContaining('URL must be public HTTPS'),
        expect.stringContaining('contentHash must be SHA-256'),
      ]),
    );
  });

  it('requires complete, source-hash-bound manual extraction evidence', () => {
    const sourceUrl =
      'https://example.gov.au/policies/image-only-ai-policy';
    const report = validatePolicies([
      buildPolicy({
        sourceUrl,
        verification: {
          status: 'verified',
          source: {
            url: sourceUrl,
            manualExtraction: {
              // @ts-expect-error deliberately invalid
              method: 'unreviewed',
              extractedAt: 'not-a-date',
              extractedBy: '',
              notes: '',
              textHash: 'not-a-hash',
              characterCount: 3,
            },
          },
          checkedAt: '2026-07-16T00:00:00.000Z',
          checkedBy: 'reviewer',
          method: 'manual',
        },
      }),
    ]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid manual extraction method'),
        expect.stringContaining('invalid manual extraction timestamp'),
        expect.stringContaining('manual extraction requires an editor'),
        expect.stringContaining('manual extraction requires notes'),
        expect.stringContaining('textHash must be SHA-256'),
        expect.stringContaining('characterCount must be at least 20'),
        expect.stringContaining('manual extraction requires a source contentHash'),
      ]),
    );
  });

  it('flags enum violations, duplicate ids, and duplicate source URLs', () => {
    const a = buildPolicy({ id: 'dup' });
    const b = buildPolicy({
      id: 'dup',
      // @ts-expect-error deliberately invalid
      type: 'memo',
      sourceUrl: `${a.sourceUrl}/?utm_source=email#details`,
      verification: {
        ...a.verification,
        source: {
          ...a.verification.source,
          url: `${a.sourceUrl}/?utm_source=email#details`,
        },
      },
    });

    const report = validatePolicies([a, b]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate id'),
        expect.stringContaining('invalid type "memo"'),
        expect.stringContaining('duplicate sourceUrl'),
      ]),
    );
  });

  const buildSuccessor = () => {
    const sourceUrl = 'https://example.gov.au/policies/successor';
    const policy = buildPolicy({ id: 'policy-2', sourceUrl });
    return {
      ...policy,
      verification: {
        ...policy.verification,
        source: { ...policy.verification.source, url: sourceUrl },
      },
    };
  };

  it('rejects a supersededBy that points nowhere', () => {
    const report = validatePolicies([
      buildPolicy({ status: 'superseded', supersededBy: 'ghost-policy' }),
    ]);
    expect(report.errors).toEqual([
      'policy-1: supersededBy "ghost-policy" does not match a policy id',
    ]);
  });

  it('rejects a superseded policy without supersededBy', () => {
    const report = validatePolicies([buildPolicy({ status: 'superseded' })]);
    expect(report.errors).toEqual([
      'policy-1: superseded status requires supersededBy',
    ]);
  });

  it('rejects a legislative record whose status disagrees with its lifecycle', () => {
    const report = validatePolicies([
      buildPolicy({
        type: 'legislation',
        status: 'active',
        legislative: {
          kind: 'bill',
          ref: { register: 'aph', billId: 'r7421' },
          origin: 'government',
          events: [
            {
              date: '2026-10-15',
              precision: 'day',
              event: { kind: 'introduced', chamber: 'lower' },
              source: { url: 'https://www.aph.gov.au/bill' },
            },
          ],
        },
      }),
    ]);
    expect(report.errors).toEqual([
      'policy-1: status "active" disagrees with its lifecycle events, which make it "proposed"',
    ]);
  });

  it('rejects a policy that supersedes itself', () => {
    const report = validatePolicies([
      buildPolicy({ status: 'superseded', supersededBy: 'policy-1' }),
    ]);
    expect(report.errors).toEqual([
      'policy-1: supersededBy cannot reference the policy itself',
    ]);
  });

  it('rejects supersededBy on a policy that is not superseded', () => {
    const successor = buildSuccessor();
    const report = validatePolicies([
      buildPolicy({ status: 'active', supersededBy: 'policy-2' }),
      successor,
    ]);
    expect(report.errors).toEqual([
      'policy-1: supersededBy requires superseded status, not "active"',
    ]);
  });

  it('accepts a superseded policy whose successor is in the same batch', () => {
    const successor = buildSuccessor();
    const superseded = buildPolicy({
      status: 'superseded',
      supersededBy: 'policy-2',
    });

    expect(validatePolicies([superseded, successor]).errors).toEqual([]);
    expect(validatePolicies([successor, superseded]).errors).toEqual([]);
  });

  it('accepts a superseded policy whose successor is already in the register', () => {
    const report = validatePolicies(
      [buildPolicy({ status: 'superseded', supersededBy: 'policy-2' })],
      new Set(['policy-2']),
    );
    expect(report.errors).toEqual([]);
  });

  it('rejects creation timestamps that are later than updates', () => {
    const report = validatePolicies([
      buildPolicy({
        createdAt: '2026-07-16T10:00:00.000Z',
        updatedAt: '2026-07-16T09:00:00.000Z',
        verification: {
          status: 'verified',
          source: {
            url: 'https://example.gov.au/policies/national-ai-ethics-framework',
            retrievedAt: '2026-07-16T10:00:00.000Z',
          },
          checkedAt: '2026-07-16T09:00:00.000Z',
          checkedBy: 'reviewer',
          method: 'manual',
        },
      }),
    ]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('createdAt cannot be later'),
      ]),
    );
  });

  it('rejects future verification and unexplained post-review retrievals', () => {
    const future = buildPolicy({
      id: 'future-verification',
      sourceUrl: 'https://example.gov.au/policies/future-verification',
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/policies/future-verification',
        },
        checkedAt: '2999-01-01T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    });
    const postReviewRetrieval = buildPolicy({
      id: 'post-review-retrieval',
      sourceUrl: 'https://example.gov.au/policies/post-review-retrieval',
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/policies/post-review-retrieval',
          retrievedAt: '2026-07-16T12:00:00.000Z',
        },
        checkedAt: '2026-07-16T10:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
      },
    });

    const report = validatePolicies([future, postReviewRetrieval]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('checkedAt cannot be in the future'),
        expect.stringContaining(
          'source retrieval cannot follow editorial verification',
        ),
      ]),
    );
  });
});

describe('validateSourceReviews', () => {
  it('validates update targets and chronological review timestamps', () => {
    const policy = buildPolicy({ id: 'existing-policy' });
    const report = validateSourceReviews(
      [
        {
          id: 'source-review-update',
          sourceUrl: policy.sourceUrl,
          title: policy.title,
          entryKind: 'policy',
          targetPolicyId: policy.id,
          sourceVersionSequence: 0,
          targetPolicyRevisionHash: 'a'.repeat(64),
          status: 'published',
          discoveredAt: '2026-07-16T10:00:00.000Z',
          createdBy: 'collector',
          analysis: {
            isRelevant: true,
            relevanceScore: 1,
            suggestedType: policy.type,
            suggestedJurisdiction: policy.jurisdiction,
            summary: 'Source changed.',
          },
          sourceEvidence: {
            url: policy.sourceUrl,
            retrievedAt: '2026-07-16T10:00:00.000Z',
          },
          proposedRecord: policy,
          reviewedAt: '2026-07-16T09:00:00.000Z',
          reviewedBy: 'reviewer',
          publishedAt: '2026-07-16T08:00:00.000Z',
          updatedAt: '2026-07-16T10:00:00.000Z',
        },
      ],
      { policies: [policy], timelineEvents: [] },
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid sourceVersionSequence'),
        expect.stringContaining('reviewedAt cannot precede discoveredAt'),
        expect.stringContaining('reviewedAt cannot precede source retrieval'),
        expect.stringContaining('publishedAt cannot precede reviewedAt'),
      ]),
    );
  });

  it('requires an approved update review to identify its target revision', () => {
    const policy = buildPolicy({ id: 'existing-policy' });
    const report = validateSourceReviews(
      [
        {
          id: 'source-review-update',
          sourceUrl: policy.sourceUrl,
          title: policy.title,
          entryKind: 'policy',
          targetPolicyId: policy.id,
          status: 'approved',
          discoveredAt: '2026-07-16T08:00:00.000Z',
          createdBy: 'collector',
          analysis: {
            isRelevant: true,
            relevanceScore: 1,
            suggestedType: policy.type,
            suggestedJurisdiction: policy.jurisdiction,
            summary: 'Source changed.',
          },
          sourceEvidence: {
            url: policy.sourceUrl,
            retrievedAt: '2026-07-16T08:00:00.000Z',
          },
          proposedRecord: policy,
          reviewedAt: '2026-07-16T09:00:00.000Z',
          reviewedBy: 'reviewer',
          updatedAt: '2026-07-16T09:00:00.000Z',
        },
      ],
      { policies: [policy], timelineEvents: [] },
    );

    expect(report.errors).toContain(
      'source-review-update: approved update review requires a target policy revision hash',
    );
  });

  it('accepts version sequencing for timeline re-verification reviews', () => {
    const timelineEvent = buildTimelineEvent({ id: 'target-event' });
    const report = validateSourceReviews(
      [
        {
          id: 'source-review-timeline-update',
          sourceUrl: timelineEvent.sourceUrl,
          title: timelineEvent.title,
          entryKind: 'timeline_event',
          targetTimelineEventId: timelineEvent.id,
          targetTimelineRevisionHash: 'a'.repeat(64),
          sourceVersionSequence: 1,
          status: 'pending_review',
          discoveredAt: '2026-07-16T08:00:00.000Z',
          createdBy: 'collector',
          analysis: {
            isRelevant: true,
            relevanceScore: 1,
            suggestedType: null,
            suggestedJurisdiction: timelineEvent.jurisdiction,
            summary: 'The tracked timeline source changed.',
          },
          sourceEvidence: {
            url: timelineEvent.sourceUrl,
            retrievedAt: '2026-07-16T08:00:00.000Z',
          },
          proposedRecord: timelineEvent,
          updatedAt: '2026-07-16T08:00:00.000Z',
        },
      ],
      { policies: [], timelineEvents: [timelineEvent] },
    );

    expect(report.errors).toEqual([]);
  });

  it('binds review targets to existing canonical records and source URLs', () => {
    const policy = buildPolicy({ id: 'target-policy' });
    const timelineEvent = buildTimelineEvent({ id: 'target-event' });
    const wrongSource = 'https://example.gov.au/different-source';
    const policyReview = {
      id: 'source-review-wrong-policy-source',
      sourceUrl: wrongSource,
      title: policy.title,
      entryKind: 'policy' as const,
      targetPolicyId: policy.id,
      targetPolicyBaseRevisionHash: 'a'.repeat(64),
      status: 'pending_review' as const,
      discoveredAt: '2026-07-16T08:00:00.000Z',
      createdBy: 'editor',
      analysis: {
        isRelevant: true,
        relevanceScore: 1,
        suggestedType: policy.type,
        suggestedJurisdiction: policy.jurisdiction,
        summary: 'Review target binding test.',
      },
      sourceEvidence: { url: wrongSource },
      proposedRecord: { ...policy, sourceUrl: wrongSource },
      updatedAt: '2026-07-16T08:00:00.000Z',
    };
    const timelineReview = {
      id: 'source-review-missing-timeline-target',
      sourceUrl: timelineEvent.sourceUrl,
      title: timelineEvent.title,
      entryKind: 'timeline_event' as const,
      targetTimelineEventId: 'missing-event',
      targetTimelineRevisionHash: 'a'.repeat(64),
      status: 'pending_review' as const,
      discoveredAt: '2026-07-16T08:00:00.000Z',
      createdBy: 'editor',
      analysis: {
        isRelevant: true,
        relevanceScore: 1,
        suggestedType: null,
        suggestedJurisdiction: timelineEvent.jurisdiction,
        summary: 'Review target binding test.',
      },
      sourceEvidence: { url: timelineEvent.sourceUrl },
      proposedRecord: { ...timelineEvent, id: 'missing-event' },
      updatedAt: '2026-07-16T08:00:00.000Z',
    };

    const report = validateSourceReviews(
      [policyReview, timelineReview],
      { policies: [policy], timelineEvents: [timelineEvent] },
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'sourceUrl does not match the target policy source',
        ),
        expect.stringContaining(
          'targetTimelineEventId does not match a timeline event',
        ),
      ]),
    );
  });

  it('accepts a published target source replacement after the canonical policy moves', () => {
    const previousSourceUrl = 'https://example.gov.au/policy-v1';
    const replacementSourceUrl = 'https://example.gov.au/policy-v2';
    const policy = buildPolicy({
      id: 'migrated-policy',
      sourceUrl: replacementSourceUrl,
    });
    const report = validateSourceReviews(
      [
        {
          id: 'source-review-published-source-replacement',
          sourceUrl: replacementSourceUrl,
          title: policy.title,
          entryKind: 'policy',
          targetPolicyId: policy.id,
          targetPolicyPreviousSourceUrl: previousSourceUrl,
          targetPolicyBaseRevisionHash: 'a'.repeat(64),
          targetPolicyRevisionHash: 'b'.repeat(64),
          status: 'published',
          discoveredAt: '2026-07-16T08:00:00.000Z',
          createdBy: 'editor',
          analysis: {
            isRelevant: true,
            relevanceScore: 1,
            suggestedType: policy.type,
            suggestedJurisdiction: policy.jurisdiction,
            summary: 'The canonical source moved to a replacement URL.',
          },
          sourceEvidence: {
            url: replacementSourceUrl,
            retrievedAt: '2026-07-16T08:00:00.000Z',
          },
          proposedRecord: policy,
          reviewedAt: '2026-07-16T09:00:00.000Z',
          reviewedBy: 'reviewer',
          publishedAt: '2026-07-16T10:00:00.000Z',
          updatedAt: '2026-07-16T10:00:00.000Z',
        },
      ],
      { policies: [policy], timelineEvents: [] },
    );

    expect(report.errors).not.toContain(
      'source-review-published-source-replacement: invalid target policy source replacement',
    );
  });

  it('retains a published historical review after a later review migrates the canonical source', () => {
    const previousSourceUrl = 'https://example.gov.au/policy-v1';
    const replacementSourceUrl = 'https://example.gov.au/policy-v2';
    const previousPolicy = buildPolicy({
      id: 'migrated-policy',
      sourceUrl: previousSourceUrl,
    });
    const currentPolicy = buildPolicy({
      id: previousPolicy.id,
      sourceUrl: replacementSourceUrl,
    });
    const common = {
      title: currentPolicy.title,
      entryKind: 'policy' as const,
      targetPolicyId: currentPolicy.id,
      targetPolicyBaseRevisionHash: 'a'.repeat(64),
      targetPolicyRevisionHash: 'b'.repeat(64),
      status: 'published' as const,
      discoveredAt: '2026-07-16T08:00:00.000Z',
      createdBy: 'editor',
      analysis: {
        isRelevant: true,
        relevanceScore: 1,
        suggestedType: currentPolicy.type,
        suggestedJurisdiction: currentPolicy.jurisdiction,
        summary: 'Canonical source migration history.',
      },
      reviewedAt: '2026-07-16T09:00:00.000Z',
      reviewedBy: 'reviewer',
      publishedAt: '2026-07-16T10:00:00.000Z',
      updatedAt: '2026-07-16T10:00:00.000Z',
    };
    const report = validateSourceReviews(
      [
        {
          ...common,
          id: 'source-review-published-original-source',
          sourceUrl: previousSourceUrl,
          sourceEvidence: { url: previousSourceUrl },
          proposedRecord: previousPolicy,
        },
        {
          ...common,
          id: 'source-review-published-source-migration',
          sourceUrl: replacementSourceUrl,
          targetPolicyPreviousSourceUrl: previousSourceUrl,
          sourceEvidence: { url: replacementSourceUrl },
          proposedRecord: currentPolicy,
        },
      ],
      { policies: [currentPolicy], timelineEvents: [] },
    );

    expect(report.errors).not.toContain(
      'source-review-published-original-source: sourceUrl does not match the target policy source',
    );
  });

  it('rejects source reviews without a usable sourceEvidence object', () => {
    const policy = buildPolicy();
    const malformedReview = {
      id: 'source-review-missing-evidence',
      sourceUrl: policy.sourceUrl,
      title: policy.title,
      entryKind: 'policy' as const,
      status: 'pending_review' as const,
      discoveredAt: '2026-07-16T08:00:00.000Z',
      createdBy: 'editor',
      analysis: {
        isRelevant: true,
        relevanceScore: 1,
        suggestedType: policy.type,
        suggestedJurisdiction: policy.jurisdiction,
        summary: 'Malformed review evidence test.',
      },
      sourceEvidence: null,
      proposedRecord: policy,
      updatedAt: '2026-07-16T08:00:00.000Z',
    };

    const report = validateSourceReviews(
      [malformedReview as never],
      { policies: [policy], timelineEvents: [] },
    );

    expect(report.errors).toContain(
      'source-review-missing-evidence: sourceEvidence requires a non-empty URL',
    );
  });

  it('requires approved payloads to satisfy the complete destination schema', () => {
    const policy = buildPolicy();
    const report = validateSourceReviews(
      [
        {
          id: 'source-review-invalid-approved',
          sourceUrl: policy.sourceUrl,
          title: policy.title,
          entryKind: 'policy',
          status: 'approved',
          discoveredAt: '2026-07-16T08:00:00.000Z',
          createdBy: 'collector',
          analysis: {
            isRelevant: true,
            relevanceScore: 1,
            suggestedType: policy.type,
            suggestedJurisdiction: policy.jurisdiction,
            summary: 'Relevant source.',
          },
          sourceEvidence: {
            url: policy.sourceUrl,
            retrievedAt: '2026-07-16T08:00:00.000Z',
          },
          proposedRecord: {
            ...policy,
            title: '',
          },
          reviewedAt: '2026-07-16T09:00:00.000Z',
          reviewedBy: 'reviewer',
          updatedAt: '2026-07-16T09:00:00.000Z',
        },
      ],
      { policies: [policy], timelineEvents: [] },
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('proposedRecord'),
        expect.stringContaining('missing title'),
      ]),
    );
  });

  describe('pending policy proposal date evidence', () => {
    const target = buildPolicy({
      id: 'qld-guideline',
      effectiveDate: '2024-09-01',
      dates: [
        {
          type: 'effective',
          date: '2024-09-01',
          precision: 'month',
          primary: true,
          source: {
            url: 'https://example.gov.au/policies/national-ai-ethics-framework',
            contentHash: 'a'.repeat(64),
            reviewedDate: {
              date: '2024-09-01',
              precision: 'month',
              reviewedAt: '2026-07-10T00:00:00.000Z',
              reviewedBy: 'test-reviewer',
              notes: 'Confirmed the effective month in the official source.',
            },
          },
        },
      ],
    });
    const freshEvidence = {
      url: target.sourceUrl,
      contentHash: 'b'.repeat(64),
      reviewedDate: {
        date: '2026-08-01',
        precision: 'month' as const,
        reviewedAt: '2026-10-15T00:00:00.000Z',
        reviewedBy: 'test-reviewer',
        notes: 'Confirmed the amended month in the changed source.',
      },
    };
    const pendingReview = (dates: Policy['dates']) => {
      const proposedRecord: Partial<Policy> = {
        ...target,
        effectiveDate: '2026-08-01',
        dates,
      };
      delete proposedRecord.verification;
      return validateSourceReviews(
        [
          {
            id: 'source-review-changed',
            sourceUrl: target.sourceUrl,
            title: target.title,
            entryKind: 'policy',
            targetPolicyId: target.id,
            targetPolicyBaseRevisionHash: 'c'.repeat(64),
            status: 'pending_review',
            discoveredAt: '2026-10-15T00:00:00.000Z',
            createdBy: 'collector',
            analysis: {
              isRelevant: true,
              relevanceScore: 1,
              suggestedType: target.type,
              suggestedJurisdiction: target.jurisdiction,
              summary: 'Source changed.',
            },
            sourceEvidence: {
              url: target.sourceUrl,
              retrievedAt: '2026-10-15T00:00:00.000Z',
              contentHash: 'b'.repeat(64),
            },
            proposedRecord: proposedRecord as Policy,
            updatedAt: '2026-10-15T00:00:00.000Z',
          },
        ],
        { policies: [target], timelineEvents: [] },
      );
    };

    it('rejects a changed primary date that keeps the old reviewedDate', () => {
      const report = pendingReview([
        {
          ...target.dates[0],
          type: 'amended',
          date: '2026-08-01',
        },
      ]);

      expect(report.errors).toEqual([
        'source-review-changed: proposedRecord: primary date requires matching source publication metadata or reviewed date evidence',
        'source-review-changed: proposedRecord: dates[0] reviewedDate must match the date and precision',
      ]);
    });

    it('rejects a secondary date whose reviewedDate contradicts it', () => {
      const report = pendingReview([
        {
          type: 'amended',
          date: '2026-08-01',
          precision: 'month',
          primary: true,
          source: freshEvidence,
        },
        { ...target.dates[0], primary: false, precision: 'day' },
      ]);

      expect(report.errors).toEqual([
        'source-review-changed: proposedRecord: dates[1] reviewedDate must match the date and precision',
      ]);
    });

    it('accepts a freshly staged primary date with matching evidence', () => {
      const report = pendingReview([
        {
          type: 'amended',
          date: '2026-08-01',
          precision: 'month',
          primary: true,
          source: freshEvidence,
        },
        { ...target.dates[0], primary: false },
      ]);

      expect(report.errors).toEqual([]);
    });
  });
});

describe('validateTimeline', () => {
  it('rejects impossible dates and missing narrative fields', () => {
    const event = buildTimelineEvent({
      date: '2026-02-31',
      description: '' as string,
    });

    const report = validateTimeline([event], new Set());

    expect(report.errors).toEqual(
      expect.arrayContaining([
        `${event.id}: invalid date "2026-02-31"`,
        `${event.id}: missing description`,
      ]),
    );
  });

  it('requires explicit precision for verified timeline dates', () => {
    const event = buildTimelineEvent();
    delete event.datePrecision;

    const report = validateTimeline([event], new Set());

    expect(report.errors).toContain(
      `${event.id}: verified timeline records require datePrecision`,
    );
  });

  it('rejects a verified timeline date without matching source evidence', () => {
    const event = buildTimelineEvent();
    delete event.verification.source.publishedAt;
    delete event.verification.source.publishedAtPrecision;

    const report = validateTimeline([event], new Set());

    expect(report.errors).toContain(
      `${event.id}: verified timeline date requires matching source publication metadata or reviewed date evidence`,
    );
  });

  it('requires placeholder dates to match month and year precision', () => {
    const report = validateTimeline(
      [
        buildTimelineEvent({
          id: 'month-event',
          date: '2025-02-14',
          datePrecision: 'month',
        }),
        buildTimelineEvent({
          id: 'year-event',
          date: '2025-02-01',
          datePrecision: 'year',
        }),
      ],
      new Set(),
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        'month-event: month precision must use the first day',
        'year-event: year precision must use 1 January',
      ]),
    );
  });

  it('flags dangling relatedPolicyId references', () => {
    const report = validateTimeline(
      [buildTimelineEvent({ relatedPolicyId: 'missing-policy' })],
      new Set(['some-other-policy']),
    );
    expect(report.errors).toEqual([
      expect.stringContaining('relatedPolicyId "missing-policy"'),
    ]);
  });

  it('allows distinct verified events to cite the same official source', () => {
    const first = buildTimelineEvent({ id: 'first-event' });
    const second = buildTimelineEvent({
      id: 'second-event',
      sourceUrl: first.sourceUrl,
      verification: {
        ...first.verification,
        source: { ...first.verification.source },
      },
    });

    const report = validateTimeline([first, second], new Set());

    expect(report.errors).toEqual([]);
  });
});

describe('validateSourceMonitoring', () => {
  it('rejects materially future manual review timestamps', () => {
    const source = {
      id: 'manual-source',
      bodyId: 'test-body',
      name: 'Manual source',
      jurisdiction: 'federal',
      category: 'government',
      url: 'https://example.gov.au/manual',
      kind: 'html-index',
      schedule: 'daily',
      enabled: true,
      automation: buildManualDecision(),
    } satisfies WatchSource;

    const report = validateSourceMonitoring(
      {
        manualReviews: [
          {
            sourceId: source.id,
            status: 'checked',
            reviewedAt: '2026-07-20T00:00:00.000Z',
            reviewedBy: 'editor',
            evidence: { url: source.url },
            notes: 'Inspected the complete source listing in a browser.',
          },
        ],
      },
      [source],
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(report.errors).toContain(
      'sourceMonitoring:manual-source: reviewedAt cannot be in the future',
    );
  });

  it('rejects successful manual checks without retained evidence and substantive notes', () => {
    const source = {
      id: 'manual-source',
      bodyId: 'test-body',
      name: 'Manual source',
      jurisdiction: 'federal',
      category: 'government',
      url: 'https://example.gov.au/manual',
      kind: 'html-index',
      schedule: 'daily',
      enabled: true,
      automation: buildManualDecision(),
    } satisfies WatchSource;

    const report = validateSourceMonitoring(
      {
        manualReviews: [
          {
            sourceId: source.id,
            status: 'checked',
            reviewedAt: '2026-07-16T00:00:00.000Z',
            reviewedBy: 'editor',
            notes: 'Checked.',
          },
        ],
      },
      [source],
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('substantive inspection notes'),
        expect.stringContaining('source evidence URL is required'),
      ]),
    );
  });
});

describe('validatePolicyFrameworkArtifact', () => {
  it('binds framework verification to the related policy revision', () => {
    const policy = buildPolicy({
      id: 'framework-policy',
      verification: {
        ...buildPolicy().verification,
        checkedAt: '2026-07-15T00:00:00.000Z',
        source: {
          url: 'https://example.gov.au/policies/national-ai-ethics-framework',
          contentHash: 'a'.repeat(64),
        },
      },
    });
    const report = validatePolicyFrameworkArtifact(
      {
        id: 'framework',
        title: policy.title,
        version: '2.0',
        authority: 'Example authority',
        sourceUrl: policy.sourceUrl,
        effectiveDate: policy.effectiveDate,
        lastUpdated: '2026-07-01',
        pillars: [{}],
        policyAims: [{}],
        inScopeCriteria: [
          {
            id: 'affected-people',
            description: 'Affects people.',
            applicableTo: 'everyone',
          },
        ],
        riskAreas: [null],
        relatedPolicyId: policy.id,
        verification: {
          status: 'verified',
          checkedAt: '2026-07-10T00:00:00.000Z',
          checkedBy: 'editor',
          method: 'manual',
          source: {
            url: policy.sourceUrl,
            contentHash: 'b'.repeat(64),
          },
        },
      },
      [policy],
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must not predate'),
        expect.stringContaining('contentHash must match'),
        expect.stringContaining('pillars[0].principles'),
        expect.stringContaining('pillars[0].requirements'),
        expect.stringContaining('policyAims[0].outcomes'),
        expect.stringContaining('inScopeCriteria[0].applicableTo'),
        expect.stringContaining('riskAreas must be a non-empty string array'),
      ]),
    );
  });
});

describe('validateDevelopments', () => {
  it('flags invalid scores and statuses', () => {
    const report = validateDevelopments([
      {
        id: 'dev-1',
        title: 'Example',
        url: 'https://www.example.gov.au/x',
        sourceId: 's',
        sourceName: 'S',
        jurisdiction: 'federal',
        detectedAt: '2026-07-10T00:00:00.000Z',
        relevanceScore: 1.4,
        classification: 'ai',
        // @ts-expect-error deliberately invalid
        status: 'archived',
      },
    ]);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('relevanceScore'),
        expect.stringContaining('invalid status "archived"'),
      ]),
    );
  });

  it('rejects a dangling timeline relationship', () => {
    const report = validateDevelopments(
      [
        {
          id: 'dev-timeline',
          title: 'Timeline development',
          url: 'https://www.example.gov.au/timeline',
          sourceId: 's',
          sourceName: 'S',
          jurisdiction: 'federal',
          detectedAt: '2026-07-10T00:00:00.000Z',
          relevanceScore: 1,
          classification: 'curated',
          assessment: {
            method: 'editorial',
            assessedAt: '2026-07-10T00:00:00.000Z',
            promptVersion: 'editorial-review-v1',
          },
          verification: {
            status: 'verified',
            source: {
              url: 'https://www.example.gov.au/timeline',
              contentHash: 'a'.repeat(64),
            },
            checkedAt: '2026-07-10T00:00:00.000Z',
            checkedBy: 'reviewer',
            method: 'manual',
          },
          status: 'promoted',
          relatedTimelineEventId: 'missing-event',
        },
      ],
      new Set(),
      new Set(['known-event']),
    );

    expect(report.errors).toContain(
      'dev-timeline: relatedTimelineEventId "missing-event" does not match a timeline event',
    );
  });
});

describe('countUnsubstantiatedSecondaryDates', () => {
  function secondaryDate(
    overrides: Partial<Policy['dates'][number]> = {},
  ): Policy['dates'][number] {
    return {
      type: 'amended',
      date: '2026-03-01',
      precision: 'day',
      ...overrides,
    };
  }

  it('counts verified secondary dates without any source evidence', () => {
    const policy = buildPolicy({
      dates: [
        {
          type: 'effective',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
          source: {
            url: 'https://example.gov.au/policies/national-ai-ethics-framework',
            contentHash: 'a'.repeat(64),
            reviewedDate: {
              date: '2025-01-01',
              precision: 'day',
              reviewedAt: '2026-07-10T00:00:00.000Z',
              reviewedBy: 'reviewer',
              notes: 'Confirmed the effective date in the official source.',
            },
          },
        },
        secondaryDate(),
      ],
    });

    expect(countUnsubstantiatedSecondaryDates([policy])).toEqual([
      { policyId: 'policy-1', dateIndex: 1 },
    ]);
  });

  it('counts secondary dates whose source lacks a SHA-256 fingerprint or matching date', () => {
    const noHash = buildPolicy({
      dates: [
        {
          type: 'effective',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
        },
        secondaryDate({
          source: {
            url: 'https://example.gov.au/x',
            reviewedDate: {
              date: '2026-03-01',
              precision: 'day',
              reviewedAt: '2026-07-10T00:00:00.000Z',
              reviewedBy: 'reviewer',
              notes: 'Date confirmed without a fingerprint.',
            },
          },
        }),
      ],
    });
    const mismatched = buildPolicy({
      id: 'policy-2',
      dates: [
        {
          type: 'effective',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
        },
        secondaryDate({
          source: {
            url: 'https://example.gov.au/y',
            contentHash: 'a'.repeat(64),
            reviewedDate: {
              date: '2025-12-31',
              precision: 'day',
              reviewedAt: '2026-07-10T00:00:00.000Z',
              reviewedBy: 'reviewer',
              notes: 'Evidence describes a different date.',
            },
          },
        }),
      ],
    });
    const publishedWithHash = buildPolicy({
      id: 'policy-3',
      dates: [
        {
          type: 'effective',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
        },
        secondaryDate({
          type: 'published',
          source: {
            url: 'https://example.gov.au/z',
            contentHash: 'a'.repeat(64),
            publishedAt: '2026-03-01',
            publishedAtPrecision: 'day',
          },
        }),
      ],
    });

    const report = countUnsubstantiatedSecondaryDates([
      noHash,
      mismatched,
      publishedWithHash,
    ]);
    expect(report).toEqual([
      { policyId: 'policy-1', dateIndex: 1 },
      { policyId: 'policy-2', dateIndex: 1 },
    ]);
  });

  it('accepts publication metadata without an explicit publishedAtPrecision key', () => {
    const policy = buildPolicy({
      dates: [
        {
          type: 'issued',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
        },
        secondaryDate({
          type: 'issued',
          source: {
            url: 'https://example.gov.au/pdf',
            contentHash: 'a'.repeat(64),
            publishedAt: '2026-03-01',
          },
        }),
      ],
    });

    expect(countUnsubstantiatedSecondaryDates([policy])).toEqual([]);
  });

  it('ignores unverified records and counts only secondary dates', () => {
    const unverified = buildPolicy({
      id: 'unverified-1',
      verification: {
        status: 'stale',
        checkedAt: '2026-07-10T00:00:00.000Z',
        checkedBy: 'reviewer',
        method: 'manual',
        source: { url: 'https://example.gov.au/stale' },
      },
      dates: [
        {
          type: 'effective',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
        },
        secondaryDate(),
      ],
    });
    const secondaryOnly = buildPolicy({
      id: 'secondary-only',
      dates: [
        {
          type: 'effective',
          date: '2025-01-01',
          precision: 'day',
          primary: true,
        },
        secondaryDate(),
      ],
    });

    expect(
      countUnsubstantiatedSecondaryDates([unverified, secondaryOnly]),
    ).toEqual([{ policyId: 'secondary-only', dateIndex: 1 }]);
  });
});

describe('validateWatchSources identity exceptions', () => {
  const base: WatchSource = {
    id: 'example-source',
    bodyId: 'test-body',
    name: 'Example source',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.industry.gov.au/news',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
    fetchStrategy: 'browser',
  };
  const exempt: WatchSource = {
    ...base,
    identityException: { until: '2026-10-21', reason: 'E24 allow-list pending' },
  };

  it('stays silent while an identity exception is current', () => {
    const report = validateWatchSources(
      [exempt],
      new Date('2026-10-20T12:59:59.999Z'),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('warns, without an error, once an identity exception has expired', () => {
    const report = validateWatchSources(
      [exempt],
      new Date('2026-10-20T13:00:00.000Z'),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(
      /watchSources:example-source: identity exception expired on 2026-10-21/,
    );
  });

  it('does not warn for sources without an exception', () => {
    const report = validateWatchSources(
      [base],
      new Date('2026-12-01T00:00:00.000Z'),
    );
    expect(report.warnings).toEqual([]);
  });
});

describe('validateWatchSources automation decisions', () => {
  const now = new Date('2026-10-22T00:00:00.000Z');
  const automatic: WatchSource = {
    id: 'finance-media',
    bodyId: 'test-body',
    name: 'Finance media',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.finance.gov.au/media',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
  };
  const refusing: WatchSource = {
    ...automatic,
    id: 'finance-news',
    url: 'https://www.finance.gov.au/about-us/news',
    automation: buildManualDecision({ because: 'identity_refused' }),
  };

  it('accepts a complete manual decision', () => {
    expect(validateWatchSources([refusing], now).errors).toEqual([]);
  });

  it('fails an automatic source on a host decided refused, naming the decider', () => {
    expect(validateWatchSources([automatic, refusing], now).errors).toEqual([
      'watchSources:finance-media: automatic source on www.finance.gov.au, which finance-news records as refusing the declared identity; move it to manual tracking or reverse that decision',
    ]);
  });

  it('lets an automatic source share a host with a manual source blocked for another reason', () => {
    const blocked = { ...refusing, automation: buildManualDecision({ because: 'bot_blocked' }) };
    expect(validateWatchSources([automatic, blocked], now).errors).toEqual([]);
  });

  it('rejects a bare manual flag and an incomplete decision', () => {
    const bare = { ...refusing, automation: 'manual' } as unknown as WatchSource;
    const incomplete = {
      ...refusing,
      id: 'incomplete',
      url: 'https://www.finance.gov.au/other',
      automation: { ...buildManualDecision(), because: 'unknown', decidedBy: '', since: '2026-11-01', evidence: 'short' },
    } as unknown as WatchSource;
    expect(validateWatchSources([bare, incomplete], now).errors).toEqual([
      "watchSources:finance-news: automation must be 'automatic' or a manual decision",
      'watchSources:incomplete: invalid manual because',
      'watchSources:incomplete: manual decision since cannot be in the future',
      'watchSources:incomplete: manual decision needs decidedBy',
      'watchSources:incomplete: manual decision needs evidence of at least 20 characters',
    ]);
  });

  it('rejects a blockedHost that is not a host name', () => {
    const linked = { ...refusing, automation: buildManualDecision({ blockedHost: 'https://www.finance.gov.au/a.pdf' }) };
    expect(validateWatchSources([linked], now).errors).toEqual([
      'watchSources:finance-news: blockedHost must be a lower-case host name',
    ]);
  });
});

describe('validateBodies', () => {
  const tierA = (jurisdiction: string) => ({
    id: `${jurisdiction}-gov`,
    name: `${jurisdiction} government`,
    jurisdiction,
    tier: 'A',
    hosts: [`www.${jurisdiction}.gov.au`],
    scope: { status: 'unassessed' },
  });
  const bodies = [
    ...['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'].map(tierA),
    {
      id: 'disr',
      name: 'Department of Industry, Science and Resources',
      jurisdiction: 'federal',
      tier: 'A',
      hosts: ['www.industry.gov.au'],
      scope: { status: 'in_scope', decidedAt: '2026-10-22', decidedBy: 'Editorial Manager' },
    },
  ];
  const source: WatchSource = {
    id: 'disr-news',
    bodyId: 'disr',
    name: 'DISR news',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.industry.gov.au/news',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
  };
  const agency = buildAgency({
    id: 'diser',
    bodyId: 'disr',
    name: 'Department of Industry, Science and Resources',
    website: 'https://www.industry.gov.au/',
  });

  it('rejects a scope decision on a date that does not exist', () => {
    const rolled = bodies.map((body) =>
      body.id === 'disr' ? { ...body, scope: { ...body.scope, decidedAt: '2026-02-30' } } : body,
    );
    expect(validateBodies(rolled, [source], {}).errors).toEqual([
      'bodies:disr: scope decidedAt must be YYYY-MM-DD',
    ]);
  });

  it('accepts sources and directory records that resolve to their body', () => {
    const subUnit = buildAgency({
      id: 'disr-ai-unit',
      bodyId: 'disr',
      name: 'Department of Industry, Science and Resources - AI unit',
      website: 'https://www.industry.gov.au/ai',
    });
    expect(validateBodies(bodies, [source], { agencies: [agency, subUnit] }).errors).toEqual([]);
  });

  it('fails an unknown body, a foreign host and a name mismatch', () => {
    const report = validateBodies(
      bodies,
      [
        { ...source, id: 'orphan', bodyId: 'nope' },
        { ...source, id: 'foreign', url: 'https://www.finance.gov.au/news' },
      ],
      { agencies: [{ ...agency, name: 'Department of Industry' }] },
    );
    expect(report.errors).toEqual([
      'watchSources:orphan: unknown bodyId nope',
      "watchSources:foreign: host www.finance.gov.au is not one of body disr's hosts",
      'agencies:diser: name "Department of Industry" differs from body disr ("Department of Industry, Science and Resources")',
    ]);
  });

  it('fails a jurisdiction mismatch and a jurisdiction without a tier A body', () => {
    const report = validateBodies(
      bodies.filter((body) => body.jurisdiction !== 'nt'),
      [{ ...source, jurisdiction: 'nsw' }],
      {},
    );
    expect(report.errors).toEqual([
      'bodies: no tier A body for nt',
      'watchSources:disr-news: jurisdiction nsw differs from body disr (federal)',
    ]);
  });

  it('reports a malformed bodies file instead of throwing', () => {
    expect(
      validateBodies([{ ...bodies[0], tier: 'D' }], [], {}).errors,
    ).toEqual(['bodies:nsw-gov: invalid tier']);
  });
});

describe('validateCollectionMeta failure classes', () => {
  const row = (overrides: Partial<SourceRunResult>): SourceRunResult => ({
    sourceId: 'source-a',
    status: 'error',
    coverageEligible: true,
    checkedAt: '2026-10-17T19:30:00.000Z',
    durationMs: 10,
    itemCount: null,
    candidateCount: 0,
    newCandidateCount: 0,
    error: 'source-a: HTTP 403',
    ...overrides,
  });
  const meta = (result: SourceRunResult): CollectionMeta => {
    const failed = result.status === 'error' ? 1 : 0;
    return {
      lastCollectedAt: '2026-10-17T19:30:00.000Z',
      lastHealthyAt: null,
      lastUsableAt: null,
      lastReviewedAt: null,
      collector: {
        runCount: 1,
        lastRunSources: ['source-a'],
        lastRunErrors: result.error ? [result.error] : [],
        health: failed ? 'failed' : 'healthy',
        dueSourceCount: 1,
        successfulSourceCount: 1 - failed,
        failedSourceCount: failed,
        skippedSourceCount: 0,
        successRate: 1 - failed,
        automaticSourceCount: 1,
        manualSourceCount: 0,
        sourceResults: [result],
      },
    };
  };

  it('accepts an error row with and without a failure class', () => {
    expect(validateCollectionMeta(meta(row({}))).errors).toEqual([]);
    expect(
      validateCollectionMeta(
        meta(
          row({
            failureClass: 'identity_refused',
            failedUrl: 'https://www.example.gov.au/feed',
          }),
        ),
      ).errors,
    ).toEqual([]);
  });

  it('rejects an unknown class, a malformed URL and fields on a success', () => {
    expect(
      validateCollectionMeta(
        meta(row({ failureClass: 'blocked' as never, failedUrl: 'nope' })),
      ).errors,
    ).toEqual([
      'meta:sourceResults[0]: invalid failureClass',
      'meta:sourceResults[0]: invalid failedUrl',
    ]);
    expect(
      validateCollectionMeta(
        meta(
          row({
            status: 'success',
            itemCount: 1,
            error: undefined,
            failureClass: 'timeout',
          }),
        ),
      ).errors,
    ).toEqual(['meta:sourceResults[0]: failure fields require a failed result']);
  });

  it.each([
    ['success', { status: 'success', itemCount: 1, error: undefined }],
    ['skipped', { status: 'skipped', error: undefined }],
  ] as const)('rejects failedUrl alone on a %s row', (_status, overrides) => {
    expect(
      validateCollectionMeta(
        meta(row({ ...overrides, failedUrl: 'https://www.example.gov.au/feed' })),
      ).errors,
    ).toContain('meta:sourceResults[0]: failure fields require a failed result');
  });

  it('requires failureClass and failedUrl together on an error row', () => {
    expect(
      validateCollectionMeta(meta(row({ failureClass: 'timeout' }))).errors,
    ).toEqual(['meta:sourceResults[0]: failureClass and failedUrl must appear together']);
    expect(
      validateCollectionMeta(
        meta(row({ failedUrl: 'https://www.example.gov.au/feed' })),
      ).errors,
    ).toEqual(['meta:sourceResults[0]: failureClass and failedUrl must appear together']);
  });

  it.each([
    'https://user:secret@www.example.gov.au/feed',
    'https://www.example.gov.au/feed?token=abc',
    'https://',
    `https://www.example.gov.au/${'a'.repeat(2100)}`,
    'ftp://www.example.gov.au/feed',
  ])('rejects failedUrl case %#', (failedUrl) => {
    expect(
      validateCollectionMeta(
        meta(row({ failureClass: 'identity_refused', failedUrl })),
      ).errors,
    ).toEqual(['meta:sourceResults[0]: invalid failedUrl']);
  });

  it('accepts decided skips with a public url and a decider', () => {
    expect(
      validateCollectionMeta(
        meta(
          row({
            status: 'success',
            itemCount: 1,
            error: undefined,
            skippedLinked: [
              { url: 'https://www.finance.gov.au/a.pdf', decidedBy: 'finance-news' },
            ],
          }),
        ),
      ).errors,
    ).toEqual([]);
  });

  it.each([
    [[], 'meta:sourceResults[0]: skippedLinked must be a non-empty array'],
    ['nope', 'meta:sourceResults[0]: skippedLinked must be a non-empty array'],
    [
      [{ url: 'https://www.finance.gov.au/a.pdf?token=abc', decidedBy: 'finance-news' }],
      'meta:sourceResults[0]: skippedLinked[0] has an invalid url',
    ],
    [
      [{ url: 'http://www.finance.gov.au/a.pdf', decidedBy: 'finance-news' }],
      'meta:sourceResults[0]: skippedLinked[0] has an invalid url',
    ],
    [
      [{ url: '', decidedBy: 'finance-news' }],
      'meta:sourceResults[0]: skippedLinked[0] has an invalid url',
    ],
    [
      [{ url: 'https://www.finance.gov.au/a.pdf', decidedBy: ' ' }],
      'meta:sourceResults[0]: skippedLinked[0] requires decidedBy',
    ],
  ])('rejects malformed skippedLinked case %#', (skippedLinked, error) => {
    expect(
      validateCollectionMeta(
        meta(row({ skippedLinked: skippedLinked as never })),
      ).errors,
    ).toEqual([error]);
  });
});

describe('validateCollectionMeta robotsUnverified', () => {
  const meta = (robotsUnverified?: unknown): CollectionMeta =>
    ({
      lastCollectedAt: '2026-10-17T19:30:00.000Z',
      lastHealthyAt: '2026-10-17T19:30:00.000Z',
      lastUsableAt: '2026-10-17T19:30:00.000Z',
      lastReviewedAt: null,
      collector: {
        runCount: 3,
        lastRunSources: [],
        lastRunErrors: [],
        health: 'healthy',
        dueSourceCount: 0,
        successfulSourceCount: 0,
        failedSourceCount: 0,
        skippedSourceCount: 0,
        successRate: 1,
        automaticSourceCount: 0,
        manualSourceCount: 0,
        sourceResults: [],
        ...(robotsUnverified === undefined ? {} : { robotsUnverified }),
      },
    }) as CollectionMeta;

  it('accepts meta without the key and a list of host keys', () => {
    expect(validateCollectionMeta(meta()).errors).toEqual([]);
    expect(validateCollectionMeta(meta(['www.example.gov.au', 'www.other.gov.au:8443'])).errors).toEqual([]);
  });

  it.each([[['WWW.Example.gov.au']], [['https://www.example.gov.au']], [[7]], ['www.example.gov.au']])(
    'rejects robotsUnverified %j',
    (value) => {
      expect(validateCollectionMeta(meta(value)).errors).toEqual(['meta: invalid collector robotsUnverified']);
    },
  );
});

describe('validateCollectionMeta run order', () => {
  const meta = (stamps: Partial<CollectionMeta>): CollectionMeta =>
    ({
      lastCollectedAt: '2026-10-17T19:30:00.000Z',
      lastHealthyAt: '2026-10-10T19:30:00.000Z',
      lastUsableAt: '2026-10-14T19:30:00.000Z',
      lastReviewedAt: null,
      collector: {
        runCount: 3,
        lastRunSources: [],
        lastRunErrors: [],
        health: 'failed',
        dueSourceCount: 0,
        successfulSourceCount: 0,
        failedSourceCount: 0,
        skippedSourceCount: 0,
        successRate: 0,
        automaticSourceCount: 0,
        manualSourceCount: 0,
        sourceResults: [],
      },
      ...stamps,
    }) as CollectionMeta;

  it('accepts healthy, then usable, then collected, and missing stamps', () => {
    expect(validateCollectionMeta(meta({})).errors).toEqual([]);
    expect(
      validateCollectionMeta(meta({ lastHealthyAt: null, lastUsableAt: null })).errors,
    ).toEqual([]);
  });

  it.each([
    [{ lastHealthyAt: '2026-10-15T00:00:00.000Z' }, 'meta: lastHealthyAt is after lastUsableAt'],
    [{ lastUsableAt: '2026-10-18T00:00:00.000Z' }, 'meta: lastUsableAt is after lastCollectedAt'],
    [
      { lastUsableAt: null, lastHealthyAt: '2026-10-18T00:00:00.000Z' },
      'meta: lastHealthyAt is after lastCollectedAt',
    ],
  ])('rejects out-of-order stamps case %#', (stamps, error) => {
    expect(validateCollectionMeta(meta(stamps)).errors).toEqual([error]);
  });
});

describe('validateWatchState sourceHealth', () => {
  const state = (lastSuccessAt: string | null): WatchState => ({
    ...emptyWatchState(),
    sourceHealth: {
      'source-a': {
        lastSuccessAt,
        firstFailureAt: '2026-10-15T00:00:00.000Z',
        consecutiveFailures: 2,
        lastFailureClass: 'timeout',
      },
    },
  });

  it('accepts failures that began after the last success', () => {
    expect(validateWatchState(state('2026-10-08T00:00:00.000Z')).errors).toEqual([]);
    expect(validateWatchState(state(null)).errors).toEqual([]);
  });

  it('rejects an empty source id', () => {
    const base = state(null);
    expect(
      validateWatchState({ ...base, sourceHealth: { '': base.sourceHealth!['source-a'] } }).errors,
    ).toEqual(['watchState:sourceHealth:: empty source id']);
  });

  it('rejects a success at or after the first failure of the streak', () => {
    expect(validateWatchState(state('2026-10-16T00:00:00.000Z')).errors).toEqual([
      'watchState:sourceHealth:source-a: lastSuccessAt must precede firstFailureAt',
    ]);
  });
});

describe('validateWatchState hosts', () => {
  const record = (): HostRecord => ({
    seenAt: '2026-10-20T19:35:00.000Z',
    robots: {
      fetchedAt: '2026-10-20T19:35:00.000Z',
      status: 'parsed',
      allow: ['/search/open'],
      disallow: ['/search', '/*.pdf$'],
      crawlDelaySec: 5,
      sitemaps: ['https://www.example.gov.au/sitemap.xml'],
    },
    backoffUntil: '2026-10-21T19:35:00.000Z',
    backoffStatus: 429,
    backoffCount: 1,
    robotsUnreachableRuns: 2,
  });
  const state = (hosts: Record<string, unknown> | undefined): WatchState =>
    ({ ...emptyWatchState(), ...(hosts === undefined ? {} : { hosts }) }) as WatchState;

  it('accepts a complete host record, one without robots and a state written before hosts existed', () => {
    expect(validateWatchState(state({ 'www.example.gov.au': record() })).errors).toEqual([]);
    expect(
      validateWatchState(
        state({
          'www.example.gov.au:8443': { ...record(), robots: null, backoffUntil: null, backoffStatus: null, backoffCount: 0 },
        }),
      ).errors,
    ).toEqual([]);
    const legacy = emptyWatchState() as Partial<WatchState>;
    delete legacy.hosts;
    expect(validateWatchState(legacy as WatchState).errors).toEqual([]);
  });

  it.each<[label: string, mutate: (host: HostRecord) => unknown]>([
    ['seenAt', (h) => ({ ...h, seenAt: 'yesterday' })],
    ['robots.fetchedAt', (h) => ({ ...h, robots: { ...h.robots, fetchedAt: '2026-10-20' } })],
    ['robots.status', (h) => ({ ...h, robots: { ...h.robots, status: 'cached' } })],
    ['robots.allow', (h) => ({ ...h, robots: { ...h.robots, allow: ['search'] } })],
    ['robots.disallow', (h) => ({ ...h, robots: { ...h.robots, disallow: [7] } })],
    ['robots.crawlDelaySec', (h) => ({ ...h, robots: { ...h.robots, crawlDelaySec: -1 } })],
    ['robots.sitemaps', (h) => ({ ...h, robots: { ...h.robots, sitemaps: ['not a url'] } })],
    ['robots.disallow', (h) => ({ ...h, robots: { ...h.robots, disallow: Array.from({ length: ROBOTS_RULES_CAP + 1 }, (_, i) => `/r${i}`) } })],
    ['robots.sitemaps', (h) => ({ ...h, robots: { ...h.robots, sitemaps: Array.from({ length: ROBOTS_SITEMAPS_CAP + 1 }, (_, i) => `https://www.example.gov.au/${i}.xml`) } })],
    ['backoffUntil', (h) => ({ ...h, backoffUntil: 1_700_000_000 })],
    ['backoffStatus', (h) => ({ ...h, backoffStatus: 500 })],
    ['backoffCount', (h) => ({ ...h, backoffCount: -1 })],
    ['backoffCount', (h) => ({ ...h, backoffCount: 1.5 })],
    ['robotsUnreachableRuns', (h) => ({ ...h, robotsUnreachableRuns: -1 })],
    ['robotsUnreachableRuns', (h) => ({ ...h, robotsUnreachableRuns: 0.5 })],
    ['robotsUnreachableRuns', ({ robotsUnreachableRuns, ...h }) => (void robotsUnreachableRuns, h)],
  ])('rejects an invalid %s', (label, mutate) => {
    const report = validateWatchState(state({ 'www.example.gov.au': mutate(record()) }));
    expect(report.errors).toEqual([expect.stringContaining(`watchState:hosts:www.example.gov.au: invalid ${label}`)]);
  });

  it.each(['WWW.Example.gov.au', 'www.example.gov.au/path', 'https://www.example.gov.au', '', 'a b.gov.au'])(
    'rejects the host key %j',
    (host) => {
      const report = validateWatchState(state({ [host]: record() }));
      expect(report.errors).toEqual([expect.stringContaining('invalid host')]);
    },
  );
});
