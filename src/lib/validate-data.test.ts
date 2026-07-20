/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { buildPolicy, buildTimelineEvent } from '@/test/factories';
import {
  isAllowedSourceHost,
  validateDevelopments,
  validatePolicyFrameworkArtifact,
  validatePolicies,
  validateSourceMonitoring,
  validateSourceReviews,
  validateTimeline,
} from './validate-data';
import type { WatchSource } from '@/lib/pipeline/sources';
import type { Policy } from '@/types';

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

  it('warns when supersededBy points nowhere', () => {
    const report = validatePolicies([
      buildPolicy({ supersededBy: 'ghost-policy' }),
    ]);
    expect(report.warnings).toEqual([
      expect.stringContaining('supersededBy "ghost-policy"'),
    ]);
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
      name: 'Manual source',
      jurisdiction: 'federal',
      category: 'government',
      url: 'https://example.gov.au/manual',
      kind: 'html-index',
      schedule: 'daily',
      enabled: true,
      automation: 'manual',
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
      name: 'Manual source',
      jurisdiction: 'federal',
      category: 'government',
      url: 'https://example.gov.au/manual',
      kind: 'html-index',
      schedule: 'daily',
      enabled: true,
      automation: 'manual',
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
