/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import {
  approvalSubject,
  parseApprovalSubject,
  verifyEditorApproval,
} from './editor-approval'
import { softwarePasskey } from '@/test/software-passkey'

const SUBJECT = approvalSubject({
  kind: 'source-review',
  id: 'source-review-1',
  proposalHash: 'a'.repeat(64),
})

describe('verifyEditorApproval', () => {
  it('accepts a registered passkey signing the exact subject and names its editor', async () => {
    const { passkey, approve } = softwarePasskey('Daniel Alkurdi')

    const result = await verifyEditorApproval(approve(SUBJECT), [passkey], SUBJECT)

    expect(result).toEqual({ ok: true, passkey })
  })

  it('refuses a signature moved to another proposal', async () => {
    const { passkey, approve } = softwarePasskey()
    const other = approvalSubject({ kind: 'source-review', id: 'source-review-1', proposalHash: 'b'.repeat(64) })
    const moved = { ...approve(SUBJECT), subject: other }

    const result = await verifyEditorApproval(moved, [passkey], other)

    expect(result.ok).toBe(false)
  })

  it('refuses a key that is not in the registry', async () => {
    const editor = softwarePasskey()
    const agent = softwarePasskey('Daniel Alkurdi')

    const result = await verifyEditorApproval(agent.approve(SUBJECT), [editor.passkey], SUBJECT)

    expect(result).toEqual({ ok: false, error: 'the approval was not signed by a registered editor passkey' })
  })

  it('refuses a signature from another origin or without user verification', async () => {
    const { passkey, approve } = softwarePasskey()

    for (const approval of [
      approve(SUBJECT, { origin: 'https://evil.example' }),
      approve(SUBJECT, { userVerified: false }),
    ]) {
      expect((await verifyEditorApproval(approval, [passkey], SUBJECT)).ok).toBe(false)
    }
  })

  it('refuses a tampered signature', async () => {
    const { passkey, approve } = softwarePasskey()
    const approval = approve(SUBJECT)
    const forged = approve(approvalSubject({ kind: 'reconfirm', batchId: 'b', entriesHash: 'c'.repeat(64) }))
    approval.response.signature = forged.response.signature

    expect((await verifyEditorApproval(approval, [passkey], SUBJECT)).ok).toBe(false)
  })
})

describe('parseApprovalSubject', () => {
  it('round-trips both subject kinds and rejects anything else', () => {
    const reconfirm = { kind: 'reconfirm', batchId: '2026-10-29-1', entriesHash: 'd'.repeat(64) } as const
    expect(parseApprovalSubject(approvalSubject(reconfirm))).toEqual(reconfirm)
    expect(parseApprovalSubject(SUBJECT)).toEqual({ kind: 'source-review', id: 'source-review-1', proposalHash: 'a'.repeat(64) })
    expect(parseApprovalSubject('source-review:x:short')).toBeNull()
    expect(parseApprovalSubject('publish:x:' + 'a'.repeat(64))).toBeNull()
  })
})
