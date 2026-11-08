/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { approvalSubject } from './editor-approval'
import { reconfirmApprovalSubject, type ReconfirmBatch } from './register-reconfirm'
import { validateSignedRecordChanges, type SignedRecordState } from './signed-record-changes'
import { buildPolicy, buildTimelineEvent } from '@/test/factories'
import { softwarePasskey } from '@/test/software-passkey'
import type { Development, Policy, SourceReview } from '@/types'

const HASH = 'b'.repeat(64)
const editor = softwarePasskey('Daniel Alkurdi')

function state(overrides: Partial<SignedRecordState> = {}): SignedRecordState {
  return {
    passkeys: [editor.passkey],
    sourceReviews: [],
    reconfirmBatches: [],
    policies: [],
    timeline: [],
    developments: [],
    ...overrides,
  }
}

function publishedReview(id: string, record: Policy, signed = true): SourceReview {
  return {
    id,
    entryKind: 'policy',
    status: 'published',
    targetPolicyId: record.id,
    proposedRecord: record,
    decision: {
      proposalHash: HASH,
      decidedBy: 'Daniel Alkurdi',
      decidedAt: '2026-11-05T00:00:00.000Z',
      ...(signed ? { approval: editor.approve(approvalSubject({ kind: 'source-review', id, proposalHash: HASH })) } : {}),
    },
  } as SourceReview
}

function development(overrides: Partial<Development> = {}): Development {
  return {
    id: 'dev-new-guidance-abc123',
    title: 'New guidance',
    url: 'https://example.gov.au/new-guidance',
    sourceId: 'example',
    sourceName: 'Example',
    jurisdiction: 'federal',
    detectedAt: '2026-11-05T00:00:00.000Z',
    relevanceScore: 0.6,
    classification: 'heuristic',
    assessment: { method: 'heuristic', assessedAt: '2026-11-05T00:00:00.000Z', promptVersion: 'v1' },
    verification: {
      status: 'needs_review',
      method: 'automated',
      source: { url: 'https://example.gov.au/new-guidance' },
    },
    status: 'detected',
    ...overrides,
  } as Development
}

const published = buildPolicy()
const edited = buildPolicy({ content: 'Detailed policy content, with a sentence nobody approved.' })

describe('validateSignedRecordChanges', () => {
  it('refuses an unsigned text edit to a published policy', () => {
    const { errors } = validateSignedRecordChanges(state({ policies: [edited] }), state({ policies: [published] }))

    expect(errors).toEqual([expect.stringMatching(/^policies:policy-1: a published record changed without a decision signed on this branch/)])
  })

  it('refuses publishing an unverified record by stamping it verified without a decision', () => {
    const draft = buildPolicy({ verification: { ...published.verification, status: 'needs_review' } })

    const { errors } = validateSignedRecordChanges(state({ policies: [published] }), state({ policies: [draft] }))

    expect(errors).toHaveLength(1)
  })

  it('accepts a signed source-review publication of exactly the approved record', () => {
    const head = state({ policies: [edited], sourceReviews: [publishedReview('source-review-1', edited)] })

    expect(validateSignedRecordChanges(head, state({ policies: [published] })).errors).toEqual([])
  })

  it('refuses a record that differs from what the signed review approved', () => {
    const approved = buildPolicy({ content: 'The approved wording.' })
    const head = state({ policies: [edited], sourceReviews: [publishedReview('source-review-1', approved)] })

    const { errors } = validateSignedRecordChanges(head, state({ policies: [published] }))

    expect(errors).toEqual(['policies:policy-1: differs from what source review source-review-1 approved'])
  })

  it('refuses a publication whose decision carries no signature', () => {
    const head = state({ policies: [edited], sourceReviews: [publishedReview('source-review-1', edited, false)] })

    expect(validateSignedRecordChanges(head, state({ policies: [published] })).errors).toHaveLength(1)
  })

  it('does not let a decision signed in an earlier pull request cover a later edit', () => {
    const review = publishedReview('source-review-1', published)
    const head = state({ policies: [edited], sourceReviews: [review] })

    const { errors } = validateSignedRecordChanges(head, state({ policies: [published], sourceReviews: [review] }))

    expect(errors).toEqual([expect.stringMatching(/^policies:policy-1: a published record changed/)])
  })

  it('accepts the developments a signed publication promotes, and refuses an unsigned edit to a promoted one', () => {
    const promoted = development({
      status: 'promoted',
      classification: 'curated',
      relatedPolicyId: edited.id,
      verification: edited.verification,
    })
    const signedHead = state({ policies: [edited], developments: [promoted], sourceReviews: [publishedReview('source-review-1', edited)] })
    expect(validateSignedRecordChanges(signedHead, state({ policies: [published], developments: [development()] })).errors).toEqual([])

    const retitled = { ...promoted, title: 'A title nobody approved' }
    const { errors } = validateSignedRecordChanges(state({ developments: [retitled] }), state({ developments: [promoted] }))
    expect(errors).toEqual([expect.stringMatching(/^developments:dev-new-guidance-abc123: a published record changed/)])
  })

  describe('renewing a development from its record\'s earlier signed publication', () => {
    const signedPolicy = buildPolicy({
      verification: {
        ...published.verification,
        status: 'verified',
        method: 'manual',
        checkedAt: '2026-11-01T00:00:00.000Z',
        checkedBy: 'Daniel Alkurdi',
      },
    })
    const signedReview = {
      ...publishedReview('source-review-signed', signedPolicy),
      reviewedAt: signedPolicy.verification.checkedAt,
      sourceEvidence: signedPolicy.verification.source,
    } as SourceReview
    const stale = development({
      status: 'promoted',
      classification: 'curated',
      relatedPolicyId: signedPolicy.id,
      url: 'https://example.gov.au/retired-page',
      verification: {
        status: 'verified',
        method: 'manual',
        checkedAt: '2026-08-01T00:00:00.000Z',
        checkedBy: 'Daniel Alkurdi',
        source: { url: 'https://example.gov.au/retired-page', contentHash: 'e'.repeat(64) },
      },
    })
    const renewed = { ...stale, url: signedPolicy.sourceUrl, verification: signedPolicy.verification }
    const origin = { id: `source-review-${stale.id}`, status: 'published', proposedRecord: { id: signedPolicy.id } } as SourceReview
    const run = (reviews: SourceReview[], head = renewed) =>
      validateSignedRecordChanges(
        state({ policies: [signedPolicy], developments: [head], sourceReviews: reviews }),
        state({ policies: [signedPolicy], developments: [stale], sourceReviews: reviews }),
      ).errors

    it('accepts renewing the development the record was promoted from', () => {
      expect(run([signedReview, origin])).toEqual([])
    })

    it('refuses copying the verification onto a related development verified from other evidence', () => {
      expect(run([signedReview])).toEqual([expect.stringMatching(/^developments:dev-new-guidance-abc123: a published record changed/)])
    })

    it('refuses a renewal from an unsigned publication or one that also edits the development', () => {
      const unsigned = { ...signedReview, decision: { ...signedReview.decision!, approval: undefined } } as SourceReview
      expect(run([unsigned, origin])).toHaveLength(1)
      expect(run([signedReview, origin], { ...renewed, title: 'A title nobody approved' })).toHaveLength(1)
    })
  })

  it('accepts a collection pull request: new detections, staged reviews and source audit times', () => {
    const staged = {
      id: 'source-review-dev-new-guidance-abc123',
      entryKind: 'policy',
      status: 'pending_review',
      proposedRecord: buildPolicy({ id: 'new-guidance', verification: { ...published.verification, status: 'needs_review' } }),
    } as SourceReview
    const audited = buildPolicy({ verification: { ...published.verification, lastSourceAuditAt: '2026-11-05T00:00:00.000Z' } })
    const head = state({ policies: [audited], developments: [development()], sourceReviews: [staged] })

    expect(validateSignedRecordChanges(head, state({ policies: [published] })).errors).toEqual([])
  })

  it('accepts withdrawing a published record without a signature', () => {
    const stale = buildPolicy({ verification: { ...published.verification, status: 'stale', notes: 'Source content changed during register audit.' } })

    expect(validateSignedRecordChanges(state({ policies: [stale] }), state({ policies: [published] })).errors).toEqual([])
  })

  it('refuses an unsigned edit to a published timeline event', () => {
    const event = buildTimelineEvent({ verification: published.verification })
    const head = state({ timeline: [{ ...event, description: 'Rewritten without review.' }] })

    const { errors } = validateSignedRecordChanges(head, state({ timeline: [event] }))

    expect(errors).toEqual([expect.stringMatching(/^timeline:/)])
  })

  describe('reconfirm batches', () => {
    const entries = [{ policyId: published.id, title: published.title, verifiedAt: published.verification.checkedAt!, verifiedBy: 'test-reviewer', contentHash: 'a'.repeat(64), auditedAt: '2026-11-04T00:00:00.000Z' }]
    const open: ReconfirmBatch = { id: '2026-11-05-1', proposedAt: '2026-11-04T00:00:00.000Z', proposedBy: 'Claude (agent)', entries }
    const approved: ReconfirmBatch = {
      ...open,
      decision: { approvedBy: 'Daniel Alkurdi', approvedAt: '2026-11-05T00:00:00.000Z', approval: editor.approve(reconfirmApprovalSubject(open)) },
    }
    const renewed = buildPolicy({
      lastReviewedAt: '2026-11-05T00:00:00.000Z',
      verification: { ...published.verification, checkedAt: '2026-11-05T00:00:00.000Z', checkedBy: 'Daniel Alkurdi', notes: 'Re-confirmed in batch 2026-11-05-1.' },
    })
    const base = state({ policies: [published], reconfirmBatches: [open] })

    it('accepts a signed batch that renews verification', () => {
      expect(validateSignedRecordChanges(state({ policies: [renewed], reconfirmBatches: [approved] }), base).errors).toEqual([])
    })

    it('refuses a signed batch that also changes the record', () => {
      const head = state({ policies: [{ ...renewed, title: 'Retitled in the batch' }], reconfirmBatches: [approved] })

      expect(validateSignedRecordChanges(head, base).errors).toHaveLength(1)
    })
  })
})
