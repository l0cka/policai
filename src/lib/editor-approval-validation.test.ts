/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { approvalSubject } from './editor-approval'
import { validateEditorApprovals, type EditorApprovalState } from './editor-approval-validation'
import { softwarePasskey } from '@/test/software-passkey'
import type { SourceReview, SourceReviewDecision } from '@/types'

const HASH = 'a'.repeat(64)
const CARD = 'https://claude.ai/code/project/chan_x?thread=cmsg_y'

function review(id: string, decision: SourceReviewDecision): SourceReview {
  return { id, status: 'published', decision } as SourceReview
}

function state(overrides: Partial<EditorApprovalState> = {}): EditorApprovalState {
  return { passkeys: [], sourceReviews: [], reconfirmBatches: [], ...overrides }
}

const subject = (id: string) => approvalSubject({ kind: 'source-review', id, proposalHash: HASH })

describe('validateEditorApprovals', () => {
  const editor = softwarePasskey('Daniel Alkurdi')
  const legacy = review('old', { proposalHash: HASH, decidedBy: 'Daniel Alkurdi', decidedAt: '2026-10-20T00:00:00.000Z', attestationUrl: CARD })

  it('keeps card-link decisions valid while no passkey is registered', async () => {
    const head = state({ sourceReviews: [legacy, review('new', { ...legacy.decision!, decidedAt: '2026-11-01T00:00:00.000Z' })] })

    expect((await validateEditorApprovals(head, state())).errors).toEqual([])
  })

  it('accepts a signed decision and the decisions made before registration', async () => {
    const signed = review('new', {
      proposalHash: HASH,
      decidedBy: 'Daniel Alkurdi',
      decidedAt: '2026-10-30T01:00:00.000Z',
      approval: editor.approve(subject('new')),
    })
    const head = state({ passkeys: [editor.passkey], sourceReviews: [legacy, signed] })

    expect((await validateEditorApprovals(head, state({ passkeys: [editor.passkey], sourceReviews: [legacy] }))).errors).toEqual([])
  })

  it('refuses a new decision without a signature, even one dated before registration', async () => {
    const backdated = review('new', { ...legacy.decision!, decidedAt: '2026-10-01T00:00:00.000Z' })
    const head = state({ passkeys: [editor.passkey], sourceReviews: [legacy, backdated] })

    const { errors } = await validateEditorApprovals(head, state({ passkeys: [editor.passkey], sourceReviews: [legacy] }))

    expect(errors).toEqual(["sourceReviews:new: decided without the editor's passkey approval"])
  })

  it('refuses a decision dated after registration without a signature when there is no base', async () => {
    const late = review('new', { ...legacy.decision!, decidedAt: '2026-11-01T00:00:00.000Z' })

    const { errors } = await validateEditorApprovals(state({ passkeys: [editor.passkey], sourceReviews: [legacy, late] }), null)

    expect(errors).toEqual(["sourceReviews:new: decided without the editor's passkey approval"])
  })

  it('refuses a decision credited to someone other than the key owner', async () => {
    const misattributed = review('new', {
      proposalHash: HASH,
      decidedBy: 'Claude (agent)',
      decidedAt: '2026-10-30T01:00:00.000Z',
      approval: editor.approve(subject('new')),
    })

    const { errors } = await validateEditorApprovals(state({ passkeys: [editor.passkey], sourceReviews: [misattributed] }), null)

    expect(errors).toEqual(['sourceReviews:new: decided by Claude (agent), but the passkey belongs to Daniel Alkurdi'])
  })

  it('refuses any change to the registry once it holds a key', async () => {
    const agent = softwarePasskey('Daniel Alkurdi')

    const { errors } = await validateEditorApprovals(
      state({ passkeys: [editor.passkey, agent.passkey] }),
      state({ passkeys: [editor.passkey] }),
    )

    expect(errors).toEqual([expect.stringContaining('editor-passkeys: the registry changed')])
  })

  it('lets the first key be registered', async () => {
    expect((await validateEditorApprovals(state({ passkeys: [editor.passkey], sourceReviews: [legacy] }), state({ sourceReviews: [legacy] }))).errors).toEqual([])
  })
})
